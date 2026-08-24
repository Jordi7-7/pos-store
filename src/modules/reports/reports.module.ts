import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from '../sales/domain/entities/sale.entity';
import { SaleItem } from '../sales/domain/entities/sale-item.entity';
import { PurchaseOrder } from '../purchases/domain/entities/purchase-order.entity';
import { Expense } from '../sales/domain/entities/expense.entity';
import { ReportsService } from './application/services/reports.service';
import { ReportsController } from './infrastructure/controllers/reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, PurchaseOrder, Expense]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
