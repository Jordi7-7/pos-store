import { Logger, HttpStatus } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { VariantInput } from '../../domain/variant-input';
import { Product } from '../../domain/entities/product.entity';
import { ProductVariant } from '../../domain/entities/product-variant.entity';
import { AttributeValue } from '../../domain/entities/attribute-value.entity';
import { ProductStock } from '../../domain/entities/product-stock.entity';
import { ProductImage } from '../../domain/entities/product-image.entity';
import { Category } from '../../domain/entities/category.entity';
import { assertBranchesExist } from '../../../branches/application/services/branch-lookup';
import { ProductType } from '../../domain/enums/product-type.enum';
import { normalizeSku } from '../../domain/sku';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { translatingSkuConflict } from './sku-conflict';
import { assertBaseSkuAvailable, assertSkusDoNotShadowBaseSku } from './base-sku';
import { recordInitialStock, SharedInitialLot } from './initial-stock';
import { assertVariantAttributesAreConsistent } from './variant-attributes';

/** Todo lo que viene del cliente por id, ya comprobado contra la tienda y cargado de una vez. */
interface ResolvedReferences {
  category: Category | null;
  images: Map<string, ProductImage>;
  attributeValues: Map<string, AttributeValue>;
}

const logger = new Logger('CreateVariableProduct');

export interface NewVariableProduct {
  tenantId: string;
  name: string;
  description: string;
  variants: VariantInput[];
  imageIds?: string[];
  categoryId?: string;
  baseSku?: string;
  /** Lote en el que entran las existencias iniciales; sin él, el producto abre uno para todas sus variantes. */
  initialLot?: SharedInitialLot;
}

/**
 * Alta de un producto con variantes. La usan la pantalla de alta y la importación masiva, que le pasa su propio
 * `EntityManager` para que todo quede en la misma transacción.
 */
export function createVariableProduct(entityManager: EntityManager, input: NewVariableProduct): Promise<Product> {
  return translatingSkuConflict(async () => {
    logger.log(`Creating variable product: ${input.name} with ${input.variants?.length ?? 0} variant(s) for Tenant: ${input.tenantId}`);
    const baseSku = validateInput(input);
    return entityManager.transaction((manager) => register(manager, input, baseSku));
  });
}

/** Reglas que no necesitan la base de datos. Devuelve el SKU base normalizado. */
function validateInput(input: NewVariableProduct): string {
  const { baseSku, variants } = input;
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

async function register(manager: EntityManager, input: NewVariableProduct, baseSku: string): Promise<Product> {
  const { tenantId, variants } = input;

  await assertBranchesExist(manager, tenantId, variants.flatMap((variant) => (variant.stocks ?? []).map((stock) => stock.branchId)));
  await assertSkusAvailable(manager, tenantId, baseSku, variants);
  const references = await resolveReferences(manager, input);
  assertVariantAttributesAreConsistent(variants.map((variant) => (variant.attributeValues ?? []).map((value) => (references.attributeValues.get(value.attributeValueId) as AttributeValue).attributeId)));

  const savedProduct = await manager.getRepository(Product).save(buildProduct(input, baseSku, references));
  const savedVariants = await manager.getRepository(ProductVariant).save(buildVariants(savedProduct, input, references));

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
    // El código de la columna admite 100 caracteres
    input.initialLot ?? new SharedInitialLot(`LOT-INIT-${baseSku}`.slice(0, 100)),
  );

  savedProduct.variants = savedVariants;
  logger.log(`Variable product created successfully: ${savedProduct.name} (ID: ${savedProduct.id})`);
  return savedProduct;
}

async function assertSkusAvailable(manager: EntityManager, tenantId: string, baseSku: string, variants: VariantInput[]): Promise<void> {
  const skus = variants.map((variant) => normalizeSku(variant.sku));
  const taken = await manager.getRepository(ProductVariant).find({ where: { sku: In(skus), tenantId }, select: { sku: true } });
  if (taken.length > 0) {
    const takenSkus = taken.map((variant) => variant.sku).sort();
    throw new AppException(ErrorCode.SkuTaken, `Estos SKU ya están registrados: ${takenSkus.join(', ')}.`, HttpStatus.CONFLICT, { skus: takenSkus });
  }
  await assertBaseSkuAvailable(manager, tenantId, baseSku);
  await assertSkusDoNotShadowBaseSku(manager, tenantId, skus);
}

/** Categoría, imágenes (del producto y de sus variantes) y valores de atributo: una consulta por tipo. */
async function resolveReferences(manager: EntityManager, input: NewVariableProduct): Promise<ResolvedReferences> {
  const { tenantId, categoryId, imageIds, variants } = input;

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

function buildProduct(input: NewVariableProduct, baseSku: string, references: ResolvedReferences): Product {
  const product = new Product();
  product.tenantId = input.tenantId;
  product.name = input.name;
  product.description = input.description;
  product.type = ProductType.VARIABLE;
  product.baseSku = baseSku;
  product.categoryId = references.category?.id ?? null;
  product.images = (input.imageIds ?? []).map((id) => references.images.get(id) as ProductImage);
  product.variants = [];
  return product;
}

function buildVariants(product: Product, input: NewVariableProduct, references: ResolvedReferences): ProductVariant[] {
  return input.variants.map((data) => {
    const variant = new ProductVariant();
    // Se enlaza por id (no por objeto) para no crear una referencia circular producto ↔ variante en la respuesta
    variant.productId = product.id;
    variant.tenantId = input.tenantId;
    variant.sku = normalizeSku(data.sku);
    variant.barcode = data.barcode || '';
    variant.purchasePrice = Number(data.purchasePrice) || 0;
    variant.salePrice = Number(data.salePrice) || 0;
    variant.wholesalePrice = data.wholesalePrice !== undefined && data.wholesalePrice !== null ? Number(data.wholesalePrice) : null;
    variant.images = (data.imageIds ?? []).map((id) => references.images.get(id) as ProductImage);
    variant.attributeValues = (data.attributeValues ?? []).map((value) => references.attributeValues.get(value.attributeValueId) as AttributeValue);
    variant.stocks = (data.stocks ?? []).map((stockInput) => {
      const stock = new ProductStock();
      stock.branchId = stockInput.branchId;
      stock.quantity = Number(stockInput.quantity) || 0;
      return stock;
    });
    return variant;
  });
}
