import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, FindOptionsWhere, In } from 'typeorm';
import { GetExpensesQuery } from './get-expenses.query';
import { Expense } from '../../../domain/entities/expense.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { visibleBranchIds } from '../../../../../common/security/branch-access.helper';

@QueryHandler(GetExpensesQuery)
export class GetExpensesHandler implements IQueryHandler<GetExpensesQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetExpensesQuery): Promise<Expense[]> {
    const { tenantId, cashSessionId } = query;
    if (!cashSessionId) {
      return [];
    }
    const where: FindOptionsWhere<Expense> = { tenantId, cashSessionId };
    // Quien no es propietario solo ve gastos de sus sucursales
    const branchIds = await visibleBranchIds(this.entityManager, this.redisService, query);
    if (branchIds) where.branchId = In(branchIds);

    return this.entityManager.getRepository(Expense).find({
      where,
      order: { createdAt: 'DESC' },
    });
  }
}
