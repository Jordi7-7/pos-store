import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetExpensesQuery } from './get-expenses.query';
import { Expense } from '../../../domain/entities/expense.entity';

@QueryHandler(GetExpensesQuery)
export class GetExpensesHandler implements IQueryHandler<GetExpensesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetExpensesQuery): Promise<Expense[]> {
    const { tenantId, cashSessionId } = query;
    if (!cashSessionId) {
      return [];
    }
    return this.entityManager.getRepository(Expense).find({
      where: { tenantId, cashSessionId },
      order: { createdAt: 'DESC' },
    });
  }
}
