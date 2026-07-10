import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Supplier } from './domain/entities/supplier.entity';
import { PurchaseOrder } from './domain/entities/purchase-order.entity';
import { CreateSupplierHandler } from './application/commands/create-supplier/create-supplier.handler';
import { RegisterPurchaseHandler } from './application/commands/register-purchase/register-purchase.handler';
import { GetSuppliersHandler } from './application/queries/get-suppliers/get-suppliers.handler';
import { PurchasesController } from './infrastructure/controllers/purchases.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Supplier, PurchaseOrder]),
    CqrsModule,
  ],
  controllers: [PurchasesController],
  providers: [
    CreateSupplierHandler,
    RegisterPurchaseHandler,
    GetSuppliersHandler,
  ],
  exports: [TypeOrmModule],
})
export class PurchasesModule {}
