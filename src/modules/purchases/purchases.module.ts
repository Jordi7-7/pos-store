import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Supplier } from './domain/entities/supplier.entity';
import { PurchaseOrder } from './domain/entities/purchase-order.entity';
import { PurchaseOrderItem } from './domain/entities/purchase-order-item.entity';
import { ProductStock } from '../products/domain/entities/product-stock.entity';
import { ProductBatch } from '../products/domain/entities/product-batch.entity';
import { InventoryMovement } from '../products/domain/entities/inventory-movement.entity';
import { ProductVariant } from '../products/domain/entities/product-variant.entity';
import { CreateSupplierHandler } from './application/commands/create-supplier/create-supplier.handler';
import { RegisterPurchaseHandler } from './application/commands/register-purchase/register-purchase.handler';
import { CancelPurchaseOrderHandler } from './application/commands/cancel-purchase-order/cancel-purchase-order.handler';
import { ImportPurchasesHandler } from './application/commands/import-purchases/import-purchases.handler';
import { ValidateImportPurchasesHandler } from './application/queries/validate-import-purchases/validate-import-purchases.handler';
import { GetPurchasesHandler } from './application/queries/get-purchases/get-purchases.handler';
import { GetSuppliersHandler } from './application/queries/get-suppliers/get-suppliers.handler';
import { GetPurchasesByProductHandler } from './application/queries/get-purchases-by-product/get-purchases-by-product.handler';
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
      ProductVariant,
    ]),
    CqrsModule,
  ],
  controllers: [PurchasesController],
  providers: [
    CreateSupplierHandler,
    RegisterPurchaseHandler,
    CancelPurchaseOrderHandler,
    ImportPurchasesHandler,
    ValidateImportPurchasesHandler,
    GetPurchasesHandler,
    GetSuppliersHandler,
    GetPurchasesByProductHandler,
  ],
  exports: [TypeOrmModule],
})
export class PurchasesModule {}
