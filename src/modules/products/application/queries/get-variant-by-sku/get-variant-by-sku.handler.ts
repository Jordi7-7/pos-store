import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetVariantBySkuQuery } from './get-variant-by-sku.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';

@QueryHandler(GetVariantBySkuQuery)
export class GetVariantBySkuHandler implements IQueryHandler<GetVariantBySkuQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetVariantBySkuQuery): Promise<any> {
    const { tenantId, sku } = query;
    const repo = this.entityManager.getRepository(ProductVariant);

    const variant = await repo.createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .select([
        'variant.id',
        'variant.sku',
        'variant.purchasePrice',
        'product.name'
      ])
      .where('variant.tenantId = :tenantId', { tenantId })
      .andWhere('LOWER(variant.sku) = LOWER(:sku)', { sku: sku.trim() })
      .getOne();

    if (!variant) {
      throw new NotFoundException(`Variante con SKU ${sku} no encontrada`);
    }

    return {
      id: variant.id,
      sku: variant.sku,
      purchasePrice: variant.purchasePrice,
      productName: variant.product.name,
    };
  }
}
