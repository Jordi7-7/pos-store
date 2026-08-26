import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Supplier } from './domain/entities/supplier.entity';
import { PurchaseOrder } from './domain/entities/purchase-order.entity';
import { PurchaseOrderItem } from './domain/entities/purchase-order-item.entity';
import { ProductStock } from '../products/domain/entities/product-stock.entity';
import { ProductBatch } from '../products/domain/entities/product-batch.entity';
import { InventoryMovement } from '../products/domain/entities/inventory-movement.entity';
import { CreateSupplierHandler } from './application/commands/create-supplier/create-supplier.handler';
import { RegisterPurchaseHandler } from './application/commands/register-purchase/register-purchase.handler';
import { CancelPurchaseOrderHandler } from './application/commands/cancel-purchase-order/cancel-purchase-order.handler';
import { GetSuppliersHandler } from './application/queries/get-suppliers/get-suppliers.handler';
import { PurchasesController } from './infrastructure/controllers/purchases.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      ProductStock,
      ProductBatch,
      InventoryMovement,
    ]),
    CqrsModule,
  ],
  controllers: [PurchasesController],
  providers: [
    CreateSupplierHandler,
    RegisterPurchaseHandler,
    CancelPurchaseOrderHandler,
    GetSuppliersHandler,
  ],
  exports: [TypeOrmModule],
})
export class PurchasesModule {}
