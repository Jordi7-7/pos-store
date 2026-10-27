import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetSalesByVariantQuery } from './get-sales-by-variant.query';
import { Sale } from '../../../domain/entities/sale.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';

@QueryHandler(GetSalesByVariantQuery)
export class GetSalesByVariantHandler implements IQueryHandler<GetSalesByVariantQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetSalesByVariantQuery) {
    const { tenantId, variantId, page, limit, branchId, userId, isOwner } = query;

    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      isOwner,
      branchId,
      actionDescription: 'consultar las ventas de la variante',
    });

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

    if (branchId) {
      queryBuilder.andWhere('sale.branchId = :branchId', { branchId });
    }

    const [data, total] = await queryBuilder
      .orderBy('sale.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
