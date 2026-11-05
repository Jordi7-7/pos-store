import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CloseCashSessionCommand } from './close-cash-session.command';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { CashSessionStatus } from '../../../domain/enums/cash-session-status.enum';
import { PaymentMethod } from '../../../domain/entities/sale-payment.entity';
import { Sale } from '../../../domain/entities/sale.entity';
import { Expense } from '../../../domain/entities/expense.entity';
import { Refund } from '../../../domain/entities/refund.entity';
import { cashDifference, expectedCashBalance } from '../../../domain/services/cash-closing';
import { lockCashSession } from '../shared/cash-session-lock';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(CloseCashSessionCommand)
export class CloseCashSessionHandler implements ICommandHandler<CloseCashSessionCommand> {
  private readonly logger = new Logger(CloseCashSessionHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CloseCashSessionCommand): Promise<CashSession> {
    const { tenantId, id, closingBalance } = command;
    this.logger.log(`Closing cash session ID: ${id} for Tenant: ${tenantId} (Reported Closing: ${closingBalance})`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const cashSessionRepo = transactionalManager.getRepository(CashSession);

      // Espera a las ventas/devoluciones/gastos en curso y bloquea nuevas hasta confirmar el cierre
      await lockCashSession(transactionalManager, id, 'update');

      // 1. Verify cash session exists, is open, and belongs to caller's tenant
      const session = await cashSessionRepo.findOne({
        where: {
          id,
          status: CashSessionStatus.OPEN,
          branch: { tenantId },
        },
        relations: { branch: true },
      });

      if (!session) {
        this.logger.warn(`Cash session closure failed: active cash session ID ${id} not found or belongs to another tenant`);
        throw new AppException(ErrorCode.CashSessionNotFound, 'Sesión de caja activa no encontrada.', HttpStatus.NOT_FOUND, { id });
      }

      // 2. Compute expected cash balance in drawer directly from database
      // Misma regla que el detalle de la sesión (summarizeCashSession): una venta sin pagos registrados
      // (datos antiguos) cuenta como cobrada en efectivo por su total
      const cashSalesRaw = await transactionalManager
        .createQueryBuilder(Sale, 's')
        .leftJoin('s.payments', 'sp')
        .where('s.cashSessionId = :sessionId', { sessionId: id })
        .andWhere('s.tenantId = :tenantId', { tenantId })
        .select(
          `COALESCE(SUM(CASE WHEN sp.id IS NULL THEN s.total WHEN sp.paymentMethod = :method THEN sp.amount ELSE 0 END), 0)`,
          'total',
        )
        .setParameter('method', PaymentMethod.EFECTIVO)
        .getRawOne<{ total: string }>();

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
      const expectedBalance = expectedCashBalance({ openingBalance, cashSales, expenses, refunds });
      const difference = cashDifference(closingBalance, expectedBalance);

      session.closingBalance = closingBalance;
      session.expectedBalance = expectedBalance;
      session.difference = difference;
      session.status = CashSessionStatus.CLOSED;
      session.closedAt = new Date();

      const savedSession = await cashSessionRepo.save(session);
      this.logger.log(`Cash session ID ${id} closed successfully (Opening: ${openingBalance}, CashSales: ${cashSales}, Expenses: ${expenses}, Refunds: ${refunds}, Expected: ${expectedBalance}, Closing: ${closingBalance}, Diff: ${difference})`);

      return savedSession;
    });
  }
}
