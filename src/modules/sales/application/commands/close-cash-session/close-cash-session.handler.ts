import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CloseCashSessionCommand } from './close-cash-session.command';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { SalePayment, PaymentMethod } from '../../../domain/entities/sale-payment.entity';
import { Expense } from '../../../domain/entities/expense.entity';
import { Refund } from '../../../domain/entities/refund.entity';

@CommandHandler(CloseCashSessionCommand)
export class CloseCashSessionHandler implements ICommandHandler<CloseCashSessionCommand> {
  private readonly logger = new Logger(CloseCashSessionHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CloseCashSessionCommand): Promise<CashSession> {
    const { tenantId, id, closingBalance } = command;
    this.logger.log(`Closing cash session ID: ${id} for Tenant: ${tenantId} (Reported Closing: ${closingBalance})`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const cashSessionRepo = transactionalManager.getRepository(CashSession);

      // 1. Verify cash session exists, is open, and belongs to caller's tenant
      const session = await cashSessionRepo.findOne({
        where: {
          id,
          status: 'OPEN',
          branch: { tenantId },
        },
        relations: { branch: true },
      });

      if (!session) {
        this.logger.warn(`Cash session closure failed: active cash session ID ${id} not found or belongs to another tenant`);
        throw new NotFoundException(`Active cash session with ID ${id} not found`);
      }

      // 2. Compute expected cash balance in drawer directly from database
      const cashSalesRaw = await transactionalManager
        .createQueryBuilder(SalePayment, 'sp')
        .innerJoin('sp.sale', 's')
        .where('s.cashSessionId = :sessionId', { sessionId: id })
        .andWhere('s.tenantId = :tenantId', { tenantId })
        .andWhere('sp.paymentMethod = :method', { method: PaymentMethod.EFECTIVO })
        .select('COALESCE(SUM(sp.amount), 0)', 'total')
        .getRawOne();

      const cashSales = parseFloat(cashSalesRaw?.total || '0');

      const expensesRaw = await transactionalManager
        .createQueryBuilder(Expense, 'e')
        .where('e.cashSessionId = :sessionId', { sessionId: id })
        .andWhere('e.tenantId = :tenantId', { tenantId })
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .getRawOne();

      const expenses = parseFloat(expensesRaw?.total || '0');

      const refundsRaw = await transactionalManager
        .createQueryBuilder(Refund, 'r')
        .where('r.cashSessionId = :sessionId', { sessionId: id })
        .andWhere('r.tenantId = :tenantId', { tenantId })
        .select('COALESCE(SUM(r.totalRefunded), 0)', 'total')
        .getRawOne();

      const refunds = parseFloat(refundsRaw?.total || '0');

      const openingBalance = Number(session.openingBalance) || 0;
      const expectedBalance = Math.round((openingBalance + cashSales - expenses - refunds) * 100) / 100;
      const difference = Math.round((closingBalance - expectedBalance) * 100) / 100;

      session.closingBalance = closingBalance;
      session.expectedBalance = expectedBalance;
      session.difference = difference;
      session.status = 'CLOSED';
      session.closedAt = new Date();

      const savedSession = await cashSessionRepo.save(session);
      this.logger.log(`Cash session ID ${id} closed successfully (Opening: ${openingBalance}, CashSales: ${cashSales}, Expenses: ${expenses}, Refunds: ${refunds}, Expected: ${expectedBalance}, Closing: ${closingBalance}, Diff: ${difference})`);

      return savedSession;
    });
  }
}
