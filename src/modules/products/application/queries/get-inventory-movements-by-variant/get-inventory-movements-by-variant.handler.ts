import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetInventoryMovementsByVariantQuery } from './get-inventory-movements-by-variant.query';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';

@QueryHandler(GetInventoryMovementsByVariantQuery)
export class GetInventoryMovementsByVariantHandler
  implements IQueryHandler<GetInventoryMovementsByVariantQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetInventoryMovementsByVariantQuery) {
    const { tenantId, variantId, page, limit, branchId, userId, userRole } = query;
    const repo = this.entityManager.getRepository(InventoryMovement);

    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      userRole,
      branchId,
      actionDescription: 'consultar los movimientos de la variante',
    });

    const qb = repo.createQueryBuilder('movement')
      .leftJoinAndSelect('movement.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('movement.originBranch', 'originBranch')
      .leftJoinAndSelect('movement.destinationBranch', 'destinationBranch')
      .where('movement.tenantId = :tenantId', { tenantId })
      .andWhere('movement.variantId = :variantId', { variantId });

    if (branchId) {
      qb.andWhere(
        '(movement.originBranchId = :branchId OR movement.destinationBranchId = :branchId)',
        { branchId },
      );
    }

    const [data, total] = await qb
      .orderBy('movement.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
