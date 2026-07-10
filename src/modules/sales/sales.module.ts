import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { CashSession } from './domain/entities/cash-session.entity';
import { Sale } from './domain/entities/sale.entity';
import { SaleItem } from './domain/entities/sale-item.entity';
import { SalePayment } from './domain/entities/sale-payment.entity';
import { Expense } from './domain/entities/expense.entity';
import { Refund } from './domain/entities/refund.entity';
import { RefundItem } from './domain/entities/refund-item.entity';
import { ProcessSaleHandler } from './application/commands/process-sale/process-sale.handler';
import { OpenCashSessionHandler } from './application/commands/open-cash-session/open-cash-session.handler';
import { CloseCashSessionHandler } from './application/commands/close-cash-session/close-cash-session.handler';
import { RegisterExpenseHandler } from './application/commands/register-expense/register-expense.handler';
import { ProcessRefundHandler } from './application/commands/process-refund/process-refund.handler';
import { GetSalesHandler } from './application/queries/get-sales/get-sales.handler';
import { SalesController } from './infrastructure/controllers/sales.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashSession,
      Sale,
      SaleItem,
      SalePayment,
      Expense,
      Refund,
      RefundItem,
    ]),
    CqrsModule,
  ],
  controllers: [SalesController],
  providers: [
    ProcessSaleHandler,
    OpenCashSessionHandler,
    CloseCashSessionHandler,
    RegisterExpenseHandler,
    ProcessRefundHandler,
    GetSalesHandler,
  ],
})
export class SalesModule {}
