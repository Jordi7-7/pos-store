import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetCashSessionsQuery } from './get-cash-sessions.query';
import { CashSession } from '../../../domain/entities/cash-session.entity';

@QueryHandler(GetCashSessionsQuery)
export class GetCashSessionsHandler implements IQueryHandler<GetCashSessionsQuery> {
  constructor(
    @InjectRepository(CashSession)
    private readonly cashSessionRepository: Repository<CashSession>,
  ) {}

  async execute(query: GetCashSessionsQuery): Promise<CashSession[]> {
    const { tenantId, branchId } = query;

    const queryBuilder = this.cashSessionRepository
      .createQueryBuilder('cs')
      .innerJoinAndSelect('cs.branch', 'branch')
      .innerJoinAndSelect('cs.user', 'user')
      .where('branch.tenantId = :tenantId', { tenantId })
      .orderBy('cs.openedAt', 'DESC');

    if (branchId) {
      queryBuilder.andWhere('cs.branchId = :branchId', { branchId });
    }

    return queryBuilder.getMany();
  }
}
