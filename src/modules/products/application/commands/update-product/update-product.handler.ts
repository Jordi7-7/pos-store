import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { UpdateProductCommand } from './update-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  private readonly logger = new Logger(UpdateProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateProductCommand): Promise<Product> {
    const { tenantId, id, name, description, imageIds, categoryId, baseSku } = command;
    this.logger.log(`Updating product (parent) ID: ${id} for Tenant: ${tenantId}`);

    const productRepo = this.entityManager.getRepository(Product);
    const imageRepo = this.entityManager.getRepository(ProductImage);
    const categoryRepo = this.entityManager.getRepository(Category);

    const product = await productRepo.findOne({
      where: { id, tenantId },
      relations: { images: true, variants: true },
    });

    if (!product) {
      this.logger.warn(`Product update failed: Product ID ${id} not found for Tenant ${tenantId}`);
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;

    const oldBaseSku = product.baseSku ? product.baseSku.trim().toUpperCase() : null;
    let newBaseSku: string | null = null;
    if (baseSku !== undefined && baseSku !== null && baseSku.trim() !== '') {
      newBaseSku = baseSku.trim().toUpperCase();
      product.baseSku = newBaseSku;
    }

    // Si cambió el baseSku y el producto tiene variantes, sincronizar los SKUs de las variantes
    if (newBaseSku && oldBaseSku && newBaseSku !== oldBaseSku && product.variants && product.variants.length > 0) {
      const variantRepo = this.entityManager.getRepository(ProductVariant);
      const oldPrefix = `${oldBaseSku}-`;
      const newPrefix = `${newBaseSku}-`;

      for (const variant of product.variants) {
        if (variant.sku.startsWith(oldPrefix)) {
          variant.sku = `${newPrefix}${variant.sku.slice(oldPrefix.length)}`;
        } else if (variant.sku === oldBaseSku) {
          variant.sku = newBaseSku;
        } else {
          // Si el SKU no comenzaba con el prefijo anterior, actualizamos o prefijamos con el nuevo
          variant.sku = `${newPrefix}${variant.sku}`;
        }
      }
      await variantRepo.save(product.variants);
      this.logger.log(`Updated SKUs for ${product.variants.length} variants of product ${product.id}`);
    }

    // Update Category if provided

    if (categoryId !== undefined) {
      if (categoryId === null || categoryId === '') {
        product.categoryId = null;
      } else {
        const category = await categoryRepo.findOne({
          where: { id: categoryId, tenantId },
        });
        if (!category) {
          throw new NotFoundException(`Category with ID ${categoryId} not found`);
        }
        product.categoryId = categoryId;
      }
    }

    // Update Images if provided
    if (imageIds !== undefined) {
      if (imageIds.length > 0) {
        const images = await imageRepo.find({
          where: { id: In(imageIds), tenantId },
        });
        if (images.length !== imageIds.length) {
          throw new BadRequestException('Some product images were not found');
        }
        product.images = images;
      } else {
        product.images = [];
      }
    }

    const savedProduct = await productRepo.save(product);
    this.logger.log(`Product (parent) updated successfully: ID ${savedProduct.id}`);

    return savedProduct;
  }
}
