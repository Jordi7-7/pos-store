import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Sale } from '../sales/domain/entities/sale.entity';
import { SaleItem } from '../sales/domain/entities/sale-item.entity';
import { PurchaseOrder } from '../purchases/domain/entities/purchase-order.entity';
import { Expense } from '../sales/domain/entities/expense.entity';
import { ReportsController } from './infrastructure/controllers/reports.controller';
import { GetReportsSummaryHandler } from './application/queries/get-reports-summary/get-reports-summary.handler';
import { GetSalesCostReportHandler } from './application/queries/get-sales-cost-report/get-sales-cost-report.handler';
import { GetValuedInventoryHandler } from './application/queries/get-valued-inventory/get-valued-inventory.handler';

const QueryHandlers = [
  GetReportsSummaryHandler,
  GetSalesCostReportHandler,
  GetValuedInventoryHandler,
];

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Sale, SaleItem, PurchaseOrder, Expense]),
  ],
  providers: [...QueryHandlers],
  controllers: [ReportsController],
})
export class ReportsModule {}
