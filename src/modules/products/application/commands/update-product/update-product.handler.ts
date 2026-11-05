import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { UpdateProductCommand } from './update-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { translatingSkuConflict } from '../../services/sku-conflict';
import { assertBaseSkuAvailable, assertSkusDoNotShadowBaseSku } from '../../services/base-sku';

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  private readonly logger = new Logger(UpdateProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: UpdateProductCommand): Promise<Product> {
    // Todo o nada: un fallo a mitad (categoría inexistente, SKU repetido) no puede dejar variantes renombradas
    return translatingSkuConflict(() => this.entityManager.transaction((manager) => this.apply(manager, command)));
  }

  private async apply(manager: EntityManager, command: UpdateProductCommand): Promise<Product> {
    const { tenantId, id, name, description, imageIds, categoryId, baseSku } = command;
    this.logger.log(`Updating product (parent) ID: ${id} for Tenant: ${tenantId}`);

    const productRepo = manager.getRepository(Product);

    const product = await productRepo.findOne({
      where: { id, tenantId },
      relations: { images: true, variants: true },
    });

    if (!product) {
      this.logger.warn(`Product update failed: Product ID ${id} not found for Tenant ${tenantId}`);
      throw new AppException(ErrorCode.ProductNotFound, 'Producto no encontrado.', HttpStatus.NOT_FOUND, { id });
    }

    // Primero se valida todo lo que viene de fuera; después se escribe
    if (categoryId !== undefined) {
      product.categoryId = await this.resolveCategoryId(manager, tenantId, categoryId);
    }
    if (imageIds !== undefined) {
      product.images = await this.resolveImages(manager, tenantId, imageIds);
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;

    const oldBaseSku = product.baseSku ? product.baseSku.trim().toUpperCase() : null;
    if (baseSku !== undefined && baseSku !== null && baseSku.trim() !== '') {
      const newBaseSku = baseSku.trim().toUpperCase();
      if (newBaseSku !== oldBaseSku) {
        await assertBaseSkuAvailable(manager, tenantId, newBaseSku, product.id);
      }
      product.baseSku = newBaseSku;
      if (oldBaseSku && newBaseSku !== oldBaseSku && product.variants?.length > 0) {
        await this.renameVariantSkus(manager, product, oldBaseSku, newBaseSku);
      }
    }

    const savedProduct = await productRepo.save(product);
    this.logger.log(`Product (parent) updated successfully: ID ${savedProduct.id}`);
    return savedProduct;
  }

  /** Categoría de la tienda, o null para quitarla (`null` o cadena vacía). */
  private async resolveCategoryId(manager: EntityManager, tenantId: string, categoryId: string | null): Promise<string | null> {
    if (categoryId === null || categoryId === '') return null;
    const category = await manager.getRepository(Category).findOne({ where: { id: categoryId, tenantId } });
    if (!category) {
      throw new AppException(ErrorCode.CategoryNotFound, 'Categoría no encontrada.', HttpStatus.NOT_FOUND, { categoryId });
    }
    return categoryId;
  }

  private async resolveImages(manager: EntityManager, tenantId: string, imageIds: string[]): Promise<ProductImage[]> {
    if (imageIds.length === 0) return [];
    const images = await manager.getRepository(ProductImage).find({ where: { id: In(imageIds), tenantId } });
    if (images.length !== imageIds.length) {
      throw new AppException(ErrorCode.ImagesNotFound, 'Una o más imágenes del producto no existen.', HttpStatus.NOT_FOUND);
    }
    return images;
  }

  /** Los SKUs de las variantes siguen al SKU base: `OLD-ROJA` pasa a `NEW-ROJA`. */
  private async renameVariantSkus(manager: EntityManager, product: Product, oldBaseSku: string, newBaseSku: string): Promise<void> {
    const oldPrefix = `${oldBaseSku}-`;
    const newPrefix = `${newBaseSku}-`;

    for (const variant of product.variants) {
      if (variant.sku.startsWith(oldPrefix)) {
        variant.sku = `${newPrefix}${variant.sku.slice(oldPrefix.length)}`;
      } else if (variant.sku === oldBaseSku) {
        variant.sku = newBaseSku;
      } else {
        // Si el SKU no comenzaba con el prefijo anterior, se antepone el nuevo
        variant.sku = `${newPrefix}${variant.sku}`;
      }
    }
    await assertSkusDoNotShadowBaseSku(manager, product.tenantId, product.variants.map((variant) => variant.sku), product.id);
    await manager.getRepository(ProductVariant).save(product.variants);
    this.logger.log(`Updated SKUs for ${product.variants.length} variants of product ${product.id}`);
  }
}
