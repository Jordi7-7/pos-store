import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetSalesByVariantQuery } from './get-sales-by-variant.query';
import { Sale } from '../../../domain/entities/sale.entity';

@QueryHandler(GetSalesByVariantQuery)
export class GetSalesByVariantHandler implements IQueryHandler<GetSalesByVariantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetSalesByVariantQuery) {
    const { tenantId, variantId, page, limit } = query;
    const queryBuilder = this.entityManager.getRepository(Sale)
      .createQueryBuilder('sale')
      .innerJoinAndSelect('sale.items', 'item')
      .innerJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.payments', 'payments')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('item.variantId = :variantId', { variantId });

    const [data, total] = await queryBuilder
      .orderBy('sale.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
