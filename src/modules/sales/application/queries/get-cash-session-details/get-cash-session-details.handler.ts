import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpStatus } from '@nestjs/common';
import { GetCashSessionDetailsQuery } from './get-cash-session-details.query';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { Sale } from '../../../domain/entities/sale.entity';
import { Expense } from '../../../domain/entities/expense.entity';
import { Refund } from '../../../domain/entities/refund.entity';
import { cashDifference, expectedCashBalance, summarizeCashSession } from '../../../domain/services/cash-closing';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import {
  EXPENSE_RELATIONS,
  EXPENSE_SELECT,
  REFUND_RELATIONS,
  REFUND_SELECT,
  SALE_RELATIONS,
  SALE_SELECT,
} from './cash-session-details.loaders';
import {
  toAmount,
  toExpenseDetail,
  toNullableAmount,
  toRefundDetail,
  toSaleDetail,
  toSessionHeader,
} from './cash-session-details.mapper';

@QueryHandler(GetCashSessionDetailsQuery)
export class GetCashSessionDetailsHandler implements IQueryHandler<GetCashSessionDetailsQuery> {
  constructor(
    @InjectRepository(CashSession)
    private readonly cashSessions: Repository<CashSession>,
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    @InjectRepository(Expense)
    private readonly expenses: Repository<Expense>,
    @InjectRepository(Refund)
    private readonly refunds: Repository<Refund>,
  ) {}

  async execute(query: GetCashSessionDetailsQuery) {
    const { tenantId, sessionId } = query;

    const session = await this.findSession(tenantId, sessionId);

    const [sales, expenses, refunds] = await Promise.all([
      this.sales.find({
        where: { cashSessionId: sessionId, tenantId },
        withDeleted: true,
        select: SALE_SELECT,
        relations: SALE_RELATIONS,
        order: { createdAt: 'DESC' },
      }),
      this.expenses.find({
        where: { cashSessionId: sessionId, tenantId },
        select: EXPENSE_SELECT,
        relations: EXPENSE_RELATIONS,
        order: { createdAt: 'DESC' },
      }),
      this.refunds.find({
        where: { cashSessionId: sessionId, tenantId },
        withDeleted: true,
        select: REFUND_SELECT,
        relations: REFUND_RELATIONS,
        order: { createdAt: 'DESC' },
      }),
    ]);

    const totals = summarizeCashSession({
      sales: sales.map((sale) => ({
        total: sale.total,
        payments: (sale.payments ?? []).map((payment) => ({ paymentMethod: payment.paymentMethod, amount: payment.amount })),
      })),
      expenseAmounts: expenses.map((expense) => expense.amount),
      refundAmounts: refunds.map((refund) => refund.totalRefunded),
    });

    // Una sesión cerrada conserva el arqueo guardado; una abierta lo calcula con lo registrado hasta ahora
    const openingBalance = toAmount(session.openingBalance);
    const closingBalance = toNullableAmount(session.closingBalance);
    const expectedBalance =
      toNullableAmount(session.expectedBalance) ??
      expectedCashBalance({
        openingBalance,
        cashSales: totals.cashSales,
        expenses: totals.totalExpenses,
        refunds: totals.totalRefunds,
      });
    const difference =
      toNullableAmount(session.difference) ??
      (closingBalance !== null ? cashDifference(closingBalance, expectedBalance) : null);

    return {
      session: { ...toSessionHeader(session), openingBalance, closingBalance, expectedBalance, difference },
      kpis: {
        grossSales: totals.grossSales,
        netSales: totals.netSales,
        cashSales: totals.cashSales,
        cardSales: totals.cardSales,
        totalExpenses: totals.totalExpenses,
        totalRefunds: totals.totalRefunds,
        salesCount: sales.length,
        expensesCount: expenses.length,
        refundsCount: refunds.length,
      },
      sales: sales.map(toSaleDetail),
      expenses: expenses.map(toExpenseDetail),
      refunds: refunds.map(toRefundDetail),
    };
  }

  private async findSession(tenantId: string, sessionId: string): Promise<CashSession> {
    const session = await this.cashSessions
      .createQueryBuilder('cs')
      .innerJoinAndSelect('cs.branch', 'branch')
      .leftJoinAndSelect('cs.user', 'user')
      .leftJoinAndSelect('cs.cashRegister', 'cashRegister')
      .where('cs.id = :sessionId', { sessionId })
      .andWhere('branch.tenantId = :tenantId', { tenantId })
      .getOne();

    if (!session) {
      throw new AppException(ErrorCode.CashSessionNotFound, 'Sesión de caja no encontrada.', HttpStatus.NOT_FOUND, { sessionId });
    }
    return session;
  }
}
