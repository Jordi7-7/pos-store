import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPurchasesByVariantQuery } from './get-purchases-by-variant.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';

@QueryHandler(GetPurchasesByVariantQuery)
export class GetPurchasesByVariantHandler implements IQueryHandler<GetPurchasesByVariantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPurchasesByVariantQuery) {
    const { tenantId, variantId, page, limit } = query;
    const queryBuilder = this.entityManager.getRepository(PurchaseOrder)
      .createQueryBuilder('purchase')
      .innerJoinAndSelect('purchase.items', 'item')
      .innerJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('purchase.branch', 'branch')
      .where('purchase.tenantId = :tenantId', { tenantId })
      .andWhere('item.variantId = :variantId', { variantId });

    const [data, total] = await queryBuilder
      .orderBy('purchase.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
