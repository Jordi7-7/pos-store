import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateVariableProductCommand } from './create-variable-product.command';
import { VariantInput } from '../create-variant/create-variant.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { normalizeSku } from '../../../domain/sku';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { translatingSkuConflict } from '../../services/sku-conflict';
import { assertBaseSkuAvailable, assertSkusDoNotShadowBaseSku } from '../../services/base-sku';
import { recordInitialStock } from '../../services/initial-stock';

/** Todo lo que viene del cliente por id, ya comprobado contra la tienda y cargado de una vez. */
interface ResolvedReferences {
  category: Category | null;
  images: Map<string, ProductImage>;
  attributeValues: Map<string, AttributeValue>;
}

@CommandHandler(CreateVariableProductCommand)
export class CreateVariableProductHandler implements ICommandHandler<CreateVariableProductCommand> {
  private readonly logger = new Logger(CreateVariableProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: CreateVariableProductCommand): Promise<Product> {
    return translatingSkuConflict(() => this.run(command));
  }

  private async run(command: CreateVariableProductCommand): Promise<Product> {
    const { tenantId, name, variants } = command;
    this.logger.log(`Creating variable product: ${name} with ${variants?.length ?? 0} variant(s) for Tenant: ${tenantId}`);

    const baseSku = this.validateInput(command);
    return this.entityManager.transaction((manager) => this.create(manager, command, baseSku));
  }

  /** Reglas que no necesitan la base de datos. Devuelve el SKU base normalizado. */
  private validateInput(command: CreateVariableProductCommand): string {
    const { baseSku, variants } = command;
    if (!baseSku || !baseSku.trim()) {
      throw new AppException(ErrorCode.BaseSkuRequired, 'El SKU base es obligatorio para un producto variable.', HttpStatus.BAD_REQUEST);
    }
    if (!variants || variants.length === 0) {
      throw new AppException(ErrorCode.VariantsRequired, 'Un producto variable debe tener al menos una variante.', HttpStatus.BAD_REQUEST);
    }

    const combinations = new Set<string>();
    for (const variant of variants) {
      const key = (variant.attributeValues ?? []).map((value) => value.attributeValueId).sort().join(',');
      if (!key) continue;
      if (combinations.has(key)) {
        throw new AppException(ErrorCode.DuplicateVariantCombination, 'No se permiten múltiples variantes con la misma combinación de atributos en un mismo producto.', HttpStatus.CONFLICT);
      }
      combinations.add(key);
    }
    return normalizeSku(baseSku);
  }

  private async create(manager: EntityManager, command: CreateVariableProductCommand, baseSku: string): Promise<Product> {
    const { tenantId, variants } = command;

    await this.assertBranchesBelongToTenant(manager, tenantId, variants);
    await this.assertSkusAvailable(manager, tenantId, baseSku, variants);
    const references = await this.resolveReferences(manager, command);

    const savedProduct = await manager.getRepository(Product).save(this.buildProduct(command, baseSku, references));
    const savedVariants = await manager.getRepository(ProductVariant).save(this.buildVariants(savedProduct, command, references));

    await recordInitialStock(
      manager,
      tenantId,
      savedVariants.flatMap((variant) =>
        variant.stocks.map((stock) => ({
          branchId: stock.branchId,
          variantId: variant.id,
          sku: variant.sku,
          quantity: Number(stock.quantity),
          unitCost: Number(variant.purchasePrice),
        })),
      ),
    );

    savedProduct.variants = savedVariants;
    this.logger.log(`Variable product created successfully: ${savedProduct.name} (ID: ${savedProduct.id})`);
    return savedProduct;
  }

  private async assertBranchesBelongToTenant(manager: EntityManager, tenantId: string, variants: VariantInput[]): Promise<void> {
    const branchIds = [...new Set(variants.flatMap((variant) => (variant.stocks ?? []).map((stock) => stock.branchId)))];
    if (branchIds.length === 0) return;

    const found = new Set((await manager.getRepository(Branch).find({ where: { id: In(branchIds), tenantId }, select: { id: true } })).map((branch) => branch.id));
    const missing = branchIds.find((id) => !found.has(id));
    if (missing) {
      throw new AppException(ErrorCode.BranchNotFound, `La sucursal con ID "${missing}" no existe o no pertenece al inquilino.`, HttpStatus.NOT_FOUND, { branchId: missing });
    }
  }

  private async assertSkusAvailable(manager: EntityManager, tenantId: string, baseSku: string, variants: VariantInput[]): Promise<void> {
    const skus = variants.map((variant) => normalizeSku(variant.sku));
    if ((await manager.getRepository(ProductVariant).count({ where: { sku: In(skus), tenantId } })) > 0) {
      throw new AppException(ErrorCode.SkuTaken, 'Uno o más SKUs ya están registrados en el sistema para este inquilino.', HttpStatus.CONFLICT);
    }
    await assertBaseSkuAvailable(manager, tenantId, baseSku);
    await assertSkusDoNotShadowBaseSku(manager, tenantId, skus);
  }

  /** Categoría, imágenes (del producto y de sus variantes) y valores de atributo: una consulta por tipo. */
  private async resolveReferences(manager: EntityManager, command: CreateVariableProductCommand): Promise<ResolvedReferences> {
    const { tenantId, categoryId, imageIds, variants } = command;

    let category: Category | null = null;
    if (categoryId) {
      category = await manager.getRepository(Category).findOne({ where: { id: categoryId, tenantId } });
      if (!category) {
        throw new AppException(ErrorCode.CategoryNotFound, 'Categoría no encontrada.', HttpStatus.NOT_FOUND, { categoryId });
      }
    }

    const wantedImageIds = [...new Set([...(imageIds ?? []), ...variants.flatMap((variant) => variant.imageIds ?? [])])];
    const images = new Map<string, ProductImage>();
    if (wantedImageIds.length > 0) {
      for (const image of await manager.getRepository(ProductImage).find({ where: { id: In(wantedImageIds), tenantId } })) {
        images.set(image.id, image);
      }
      if (wantedImageIds.some((id) => !images.has(id))) {
        throw new AppException(ErrorCode.ImagesNotFound, 'Una o más imágenes no existen.', HttpStatus.NOT_FOUND);
      }
    }

    const wantedValueIds = [...new Set(variants.flatMap((variant) => (variant.attributeValues ?? []).map((value) => value.attributeValueId)))];
    const attributeValues = new Map<string, AttributeValue>();
    if (wantedValueIds.length > 0) {
      const found = await manager.getRepository(AttributeValue).find({
        where: { id: In(wantedValueIds), attribute: { tenantId } },
        relations: { attribute: true },
      });
      for (const value of found) attributeValues.set(value.id, value);
      if (wantedValueIds.some((id) => !attributeValues.has(id))) {
        throw new AppException(ErrorCode.AttributeValuesNotFound, 'Uno o más valores de atributo no existen.', HttpStatus.NOT_FOUND);
      }
    }

    return { category, images, attributeValues };
  }

  private buildProduct(command: CreateVariableProductCommand, baseSku: string, references: ResolvedReferences): Product {
    const product = new Product();
    product.tenantId = command.tenantId;
    product.name = command.name;
    product.description = command.description;
    product.type = ProductType.VARIABLE;
    product.baseSku = baseSku;
    product.categoryId = references.category?.id ?? null;
    product.images = (command.imageIds ?? []).map((id) => references.images.get(id) as ProductImage);
    product.variants = [];
    return product;
  }

  private buildVariants(product: Product, command: CreateVariableProductCommand, references: ResolvedReferences): ProductVariant[] {
    return command.variants.map((input) => {
      const variant = new ProductVariant();
      // Se enlaza por id (no por objeto) para no crear una referencia circular producto ↔ variante en la respuesta
      variant.productId = product.id;
      variant.tenantId = command.tenantId;
      variant.sku = normalizeSku(input.sku);
      variant.barcode = input.barcode || '';
      variant.purchasePrice = Number(input.purchasePrice) || 0;
      variant.salePrice = Number(input.salePrice) || 0;
      variant.wholesalePrice = input.wholesalePrice !== undefined && input.wholesalePrice !== null ? Number(input.wholesalePrice) : null;
      variant.images = (input.imageIds ?? []).map((id) => references.images.get(id) as ProductImage);
      variant.attributeValues = (input.attributeValues ?? []).map((value) => references.attributeValues.get(value.attributeValueId) as AttributeValue);
      variant.stocks = (input.stocks ?? []).map((stockInput) => {
        const stock = new ProductStock();
        stock.branchId = stockInput.branchId;
        stock.quantity = Number(stockInput.quantity) || 0;
        return stock;
      });
      return variant;
    });
  }
}
