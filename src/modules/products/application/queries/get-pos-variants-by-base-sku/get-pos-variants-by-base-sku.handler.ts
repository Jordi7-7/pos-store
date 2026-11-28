import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPosVariantsByBaseSkuQuery } from './get-pos-variants-by-base-sku.query';
import { Product } from '../../../domain/entities/product.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { normalizeSku } from '../../../domain/sku';
import { buildSelectorAttributes, sortBySku, sortCombination } from '../../../domain/services/pos-variant-view';
import { PosVariableProductResponse } from '../../read-models/pos-variable-product-response';
import { posSaleVariantQuery, toPosSaleVariant } from '../../services/pos-sale-variant';

@QueryHandler(GetPosVariantsByBaseSkuQuery)
export class GetPosVariantsByBaseSkuHandler implements IQueryHandler<GetPosVariantsByBaseSkuQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPosVariantsByBaseSkuQuery): Promise<PosVariableProductResponse | null> {
    const { tenantId, baseSku, branchId } = query;

    // Búsqueda indexada por (tenant_id, base_sku). Las variantes van en otra consulta: unir aquí las fotos del
    // producto con las variantes multiplicaría las filas
    const product = await this.entityManager
      .getRepository(Product)
      .createQueryBuilder('product')
      .select(['product.id', 'product.name', 'product.type', 'product.baseSku'])
      .leftJoin('product.images', 'image')
      .addSelect(['image.id', 'image.url'])
      .where('product.tenantId = :tenantId', { tenantId })
      .andWhere('product.baseSku = :baseSku', { baseSku: normalizeSku(baseSku) })
      .andWhere('product.type = :productType', { productType: ProductType.VARIABLE })
      .getOne();
    if (!product) return null;

    const variants = sortBySku(
      await posSaleVariantQuery(this.entityManager, branchId)
        .where('variant.tenantId = :tenantId', { tenantId })
        .andWhere('variant.productId = :productId', { productId: product.id })
        .getMany(),
    );
    if (variants.length === 0) return null;

    const productImage = product.images?.[0]?.url ?? null;
    const items = variants.map((variant) => {
      const item = toPosSaleVariant(variant);
      return {
        ...item,
        imageUrl: item.imageUrl ?? productImage,
        attributeValues: sortCombination(variant.attributeValues ?? []).map((option) => ({ attributeId: option.attributeId, valueId: option.id })),
      };
    });

    return {
      productId: product.id,
      productName: product.name,
      productType: product.type,
      baseSku: product.baseSku,
      imageUrl: productImage ?? items.find((item) => item.imageUrl)?.imageUrl ?? null,
      attributes: buildSelectorAttributes(variants.map((variant) => variant.attributeValues ?? [])),
      variants: items,
    };
  }
}
