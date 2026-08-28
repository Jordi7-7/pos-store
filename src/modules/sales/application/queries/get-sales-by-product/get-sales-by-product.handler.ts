import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetSalesByProductQuery } from './get-sales-by-product.query';
import { Sale } from '../../../domain/entities/sale.entity';

@QueryHandler(GetSalesByProductQuery)
export class GetSalesByProductHandler implements IQueryHandler<GetSalesByProductQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetSalesByProductQuery) {
    const { tenantId, productId, page, limit } = query;
    const queryBuilder = this.entityManager.getRepository(Sale)
      .createQueryBuilder('sale')
      .innerJoinAndSelect('sale.items', 'item')
      .innerJoinAndSelect('item.variant', 'variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('sale.customer', 'customer')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('product.id = :productId', { productId });

    const [data, total] = await queryBuilder
      .orderBy('sale.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
