import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { ProductVariant } from '../../domain/entities/product-variant.entity';
import { optionAttributeName, sortCombination } from '../../domain/services/pos-variant-view';
import { PosSaleVariant } from '../read-models/pos-variant-response';

/** Variantes con solo las columnas que usa el escaneo del POS y la existencia de la sucursal pedida. */
export function posSaleVariantQuery(manager: EntityManager, branchId: string): SelectQueryBuilder<ProductVariant> {
  return manager
    .getRepository(ProductVariant)
    .createQueryBuilder('variant')
    .select(['variant.id', 'variant.sku', 'variant.barcode', 'variant.salePrice', 'variant.wholesalePrice'])
    .leftJoin('variant.images', 'image')
    .addSelect(['image.id', 'image.url'])
    .leftJoin('variant.attributeValues', 'option')
    .addSelect(['option.id', 'option.attributeId', 'option.value', 'option.sortOrder', 'option.createdAt'])
    .leftJoin('option.attribute', 'attribute')
    .addSelect(['attribute.id', 'attribute.name'])
    .leftJoin('variant.stocks', 'stock', 'stock.branchId = :branchId', { branchId })
    .addSelect(['stock.id', 'stock.quantity']);
}

export function toPosSaleVariant(variant: ProductVariant): PosSaleVariant {
  return {
    id: variant.id,
    sku: variant.sku,
    barcode: variant.barcode,
    salePrice: variant.salePrice,
    wholesalePrice: variant.wholesalePrice,
    // La consulta ya filtra por sucursal: sin fila, no hay existencia
    stock: Number(variant.stocks?.[0]?.quantity ?? 0),
    attributes: sortCombination(variant.attributeValues ?? []).map((option) => ({ name: optionAttributeName(option), value: option.value })),
    imageUrl: variant.images?.[0]?.url ?? null,
  };
}
