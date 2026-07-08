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
  providers: [ProcessSaleHandler],
})
export class SalesModule {}
