import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPosVariantBySkuQuery } from './get-pos-variant-by-sku.query';
import { PosVariantResponse } from '../../read-models/pos-variant-response';
import { posSaleVariantQuery, toPosSaleVariant } from '../../services/pos-sale-variant';
import { sortBySku } from '../../../domain/services/pos-variant-view';
import { normalizeSku } from '../../../domain/sku';

@QueryHandler(GetPosVariantBySkuQuery)
export class GetPosVariantBySkuHandler implements IQueryHandler<GetPosVariantBySkuQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPosVariantBySkuQuery): Promise<PosVariantResponse[]> {
    const { tenantId, sku, branchId } = query;

    const variants = await posSaleVariantQuery(this.entityManager, branchId)
      .innerJoin('variant.product', 'product')
      .addSelect(['product.id', 'product.name', 'product.type'])
      .where('variant.tenantId = :tenantId', { tenantId })
      .andWhere('(variant.sku = :sku OR variant.barcode = :barcode)', { sku: normalizeSku(sku), barcode: sku.trim() })
      .getMany();

    return sortBySku(variants).map((variant) => ({
      ...toPosSaleVariant(variant),
      productName: variant.product.name,
      productType: variant.product.type,
    }));
  }
}
