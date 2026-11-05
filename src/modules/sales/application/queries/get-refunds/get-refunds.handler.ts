import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, FindOptionsWhere, In } from 'typeorm';
import { GetRefundsQuery } from './get-refunds.query';
import { Refund } from '../../../domain/entities/refund.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { visibleBranchIds } from '../../../../../common/security/branch-access.helper';

@QueryHandler(GetRefundsQuery)
export class GetRefundsHandler implements IQueryHandler<GetRefundsQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetRefundsQuery): Promise<Refund[]> {
    const { tenantId, cashSessionId, saleId } = query;
    const where: FindOptionsWhere<Refund> = { tenantId };
    // Quien no es propietario solo ve devoluciones de sus sucursales
    const branchIds = await visibleBranchIds(this.entityManager, this.redisService, query);
    if (branchIds) where.branchId = In(branchIds);
    if (cashSessionId) where.cashSessionId = cashSessionId;
    if (saleId) where.saleId = saleId;

    return this.entityManager.getRepository(Refund).find({
      where,
      relations: { items: { variant: { product: true } } },
      order: { createdAt: 'DESC' },
    });
  }
}
