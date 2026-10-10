import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPurchasesByVariantQuery } from './get-purchases-by-variant.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';

@QueryHandler(GetPurchasesByVariantQuery)
export class GetPurchasesByVariantHandler implements IQueryHandler<GetPurchasesByVariantQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetPurchasesByVariantQuery) {
    const { tenantId, variantId, page, limit, branchId, userId, userRole } = query;

    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      userRole,
      branchId,
      actionDescription: 'consultar las compras de la variante',
    });

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

    if (branchId) {
      queryBuilder.andWhere('purchase.branchId = :branchId', { branchId });
    }

    const [data, total] = await queryBuilder
      .orderBy('purchase.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
