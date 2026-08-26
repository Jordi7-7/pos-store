import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { GetCashSessionDetailsQuery } from './get-cash-session-details.query';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { Sale } from '../../../domain/entities/sale.entity';
import { Expense } from '../../../domain/entities/expense.entity';
import { Refund } from '../../../domain/entities/refund.entity';

@QueryHandler(GetCashSessionDetailsQuery)
export class GetCashSessionDetailsHandler implements IQueryHandler<GetCashSessionDetailsQuery> {
  constructor(
    @InjectRepository(CashSession)
    private readonly cashSessionRepository: Repository<CashSession>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(Refund)
    private readonly refundRepository: Repository<Refund>,
  ) {}

  async execute(query: GetCashSessionDetailsQuery) {
    const { tenantId, sessionId } = query;

    const session = await this.cashSessionRepository
      .createQueryBuilder('cs')
      .innerJoinAndSelect('cs.branch', 'branch')
      .innerJoinAndSelect('cs.user', 'user')
      .where('cs.id = :sessionId', { sessionId })
      .andWhere('branch.tenantId = :tenantId', { tenantId })
      .getOne();

    if (!session) {
      throw new NotFoundException(`Cash session with ID ${sessionId} not found or access denied`);
    }

    const sales = await this.saleRepository.find({
      where: { cashSessionId: sessionId, tenantId },
      relations: { customer: true, user: true, items: true },
      order: { createdAt: 'ASC' },
    });

    const expenses = await this.expenseRepository.find({
      where: { cashSessionId: sessionId, tenantId },
      order: { createdAt: 'ASC' },
    });

    const refunds = await this.refundRepository.find({
      where: { cashSessionId: sessionId, tenantId },
      relations: { user: true, items: { variant: { product: true } }, sale: true },
      order: { createdAt: 'ASC' },
    });

    return {
      session,
      sales,
      expenses,
      refunds,
    };
  }
}
