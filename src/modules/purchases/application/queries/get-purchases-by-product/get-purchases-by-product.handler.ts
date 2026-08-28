import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPurchasesByProductQuery } from './get-purchases-by-product.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';

@QueryHandler(GetPurchasesByProductQuery)
export class GetPurchasesByProductHandler implements IQueryHandler<GetPurchasesByProductQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPurchasesByProductQuery) {
    const { tenantId, productId, page, limit } = query;
    const queryBuilder = this.entityManager.getRepository(PurchaseOrder)
      .createQueryBuilder('purchase')
      .innerJoinAndSelect('purchase.items', 'item')
      .innerJoinAndSelect('item.variant', 'variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('purchase.branch', 'branch')
      .where('purchase.tenantId = :tenantId', { tenantId })
      .andWhere('product.id = :productId', { productId });

    const [data, total] = await queryBuilder
      .orderBy('purchase.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
