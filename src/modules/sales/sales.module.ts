import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { CashSession } from './domain/entities/cash-session.entity';
import { CashRegister } from './domain/entities/cash-register.entity';
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
import { GetCashSessionsHandler } from './application/queries/get-cash-sessions/get-cash-sessions.handler';
import { GetCashSessionDetailsHandler } from './application/queries/get-cash-session-details/get-cash-session-details.handler';
import { GetSaleByInvoiceHandler } from './application/queries/get-sale-by-invoice/get-sale-by-invoice.handler';
import { GetSalesByProductHandler } from './application/queries/get-sales-by-product/get-sales-by-product.handler';
import { GetSalesPaginatedHandler } from './application/queries/get-sales-paginated/get-sales-paginated.handler';
import { GetActiveCashSessionHandler } from './application/queries/get-active-cash-session/get-active-cash-session.handler';
import { GetCashRegistersHandler } from './application/queries/get-cash-registers/get-cash-registers.handler';
import { GetMyCashRegistersHandler } from './application/queries/get-my-cash-registers/get-my-cash-registers.handler';
import { CreateCashRegisterHandler } from './application/commands/create-cash-register/create-cash-register.handler';
import { UpdateCashRegisterHandler } from './application/commands/update-cash-register/update-cash-register.handler';
import { AssignUsersToCashRegisterHandler } from './application/commands/assign-users-to-cash-register/assign-users-to-cash-register.handler';
import { SalesController } from './infrastructure/controllers/sales.controller';
import { CashRegistersController } from './infrastructure/controllers/cash-registers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashSession,
      CashRegister,
      Sale,
      SaleItem,
      SalePayment,
      Expense,
      Refund,
      RefundItem,
    ]),
    CqrsModule,
  ],
  controllers: [SalesController, CashRegistersController],
  providers: [
    ProcessSaleHandler,
    OpenCashSessionHandler,
    CloseCashSessionHandler,
    RegisterExpenseHandler,
    ProcessRefundHandler,
    GetSalesHandler,
    GetCashSessionsHandler,
    GetCashSessionDetailsHandler,
    GetSaleByInvoiceHandler,
    GetSalesByProductHandler,
    GetSalesPaginatedHandler,
    GetActiveCashSessionHandler,
    GetCashRegistersHandler,
    GetMyCashRegistersHandler,
    CreateCashRegisterHandler,
    UpdateCashRegisterHandler,
    AssignUsersToCashRegisterHandler,
  ],
})
export class SalesModule {}
