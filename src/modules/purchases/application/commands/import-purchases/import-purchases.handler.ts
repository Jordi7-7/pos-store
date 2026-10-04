import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ImportPurchasesCommand } from './import-purchases.command';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../../../domain/entities/purchase-order-item.entity';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { ProductBatch } from '../../../../products/domain/entities/product-batch.entity';
import { Batch, BatchOriginType } from '../../../../batches/domain/entities/batch.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';

@CommandHandler(ImportPurchasesCommand)
export class ImportPurchasesHandler implements ICommandHandler<ImportPurchasesCommand> {
  private readonly logger = new Logger(ImportPurchasesHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: ImportPurchasesCommand): Promise<PurchaseOrder> {
    const { tenantId, branchId, items } = command;
    this.logger.log(`Executing bulk purchase import: ${items.length} items for Branch: ${branchId}`);

    if (items.length === 0) {
      throw new BadRequestException('No se proporcionaron registros para importar.');
    }

    if (items.length > 3000) {
      throw new BadRequestException(
        `El archivo contiene ${items.length} filas. El límite máximo permitido por importación es de 3,000 registros.`,
      );
    }

    return this.entityManager.transaction(async (tm) => {
      const purchaseRepo = tm.getRepository(PurchaseOrder);
      const itemRepo = tm.getRepository(PurchaseOrderItem);
      const supplierRepo = tm.getRepository(Supplier);
      const branchRepo = tm.getRepository(Branch);
      const variantRepo = tm.getRepository(ProductVariant);
      const stockRepo = tm.getRepository(ProductStock);
      const batchRepo = tm.getRepository(ProductBatch);
      const batchHeaderRepo = tm.getRepository(Batch);
      const movementRepo = tm.getRepository(InventoryMovement);

      // Verify branch exists
      const branch = await branchRepo.findOne({ where: { id: branchId, tenantId } });
      if (!branch) {
        throw new NotFoundException(`La sucursal destino con ID ${branchId} no existe.`);
      }

      // Find generic supplier
      let supplier = await supplierRepo.findOne({ where: { identityNumber: 'GENERICO', tenantId } });
      if (!supplier) {
        supplier = await supplierRepo.findOne({ where: { tenantId } });
      }
      if (!supplier) {
        throw new NotFoundException('No se encontró un proveedor configurado para este tenant.');
      }

      // Resolve all variants in batch to check existence
      const skus = items.map((it) => it.sku.trim());
      const variants = await variantRepo.find({
        where: { sku: In(skus), tenantId },
      });

      const variantMap = new Map(variants.map((v) => [v.sku.toLowerCase(), v]));

      // Verify all SKUs exist
      const missingSkus: string[] = [];
      for (const sku of skus) {
        if (!variantMap.has(sku.toLowerCase())) {
          missingSkus.push(sku);
        }
      }

      if (missingSkus.length > 0) {
        throw new BadRequestException(`Los siguientes SKUs no existen en el catálogo: ${missingSkus.join(', ')}`);
      }

      // Verify all items have positive quantities
      for (const itemDto of items) {
        if (Number(itemDto.quantity) <= 0) {
          throw new BadRequestException(`La cantidad para el SKU ${itemDto.sku} debe ser mayor a 0.`);
        }
      }

      // Calculate total purchase amount
      let totalAmount = 0;
      for (const itemDto of items) {
        const variant = variantMap.get(itemDto.sku.toLowerCase())!;
        totalAmount += itemDto.quantity * Number(variant.purchasePrice || 0);
      }

      // Create main PurchaseOrder
      const purchaseOrder = new PurchaseOrder();
      purchaseOrder.tenantId = tenantId;
      purchaseOrder.supplierId = supplier.id;
      purchaseOrder.branchId = branchId;
      purchaseOrder.invoiceNumber = 'IMP-MASIVO';
      purchaseOrder.totalAmount = totalAmount;
      purchaseOrder.status = 'COMPLETED';
      const savedPurchase = await purchaseRepo.save(purchaseOrder);

      // Create physical Batch header for this imported purchase
      const batchHeader = new Batch();
      batchHeader.tenantId = tenantId;
      batchHeader.branchId = branchId;
      batchHeader.purchaseOrderId = savedPurchase.id;
      batchHeader.code = 'COMPRA-MASIVA';
      batchHeader.originType = BatchOriginType.PURCHASE;
      const savedBatchHeader = await batchHeaderRepo.save(batchHeader);

      const inventoryMovements: InventoryMovement[] = [];

      for (const itemDto of items) {
        const variant = variantMap.get(itemDto.sku.toLowerCase())!;
        const qty = Number(itemDto.quantity);
        const cost = Number(variant.purchasePrice || 0);

        // Save Item
        const orderItem = new PurchaseOrderItem();
        orderItem.purchaseOrderId = savedPurchase.id;
        orderItem.variantId = variant.id;
        orderItem.quantity = qty;
        orderItem.purchasePrice = cost;
        await itemRepo.save(orderItem);

        // Update branch stock (pessimistic lock to prevent race conditions)
        let branchStock = await stockRepo.findOne({
          where: { branchId, variantId: variant.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!branchStock) {
          branchStock = new ProductStock();
          branchStock.branchId = branchId;
          branchStock.variantId = variant.id;
          branchStock.quantity = 0;
        }
        const previousStock = Number(branchStock.quantity);
        const negativeDebt = previousStock < 0 ? Math.abs(previousStock) : 0;
        const remainingForFutureSales = Math.max(0, qty - negativeDebt);

        branchStock.quantity = previousStock + qty;
        await stockRepo.save(branchStock);

        // Create ProductBatch linked to the Batch header
        const batch = new ProductBatch();
        batch.tenantId = tenantId;
        batch.branchId = branchId;
        batch.batchId = savedBatchHeader.id;
        batch.variantId = variant.id;
        batch.initialQuantity = qty;
        batch.remainingQuantity = remainingForFutureSales;
        batch.unitCost = cost;
        await batchRepo.save(batch);

        // Create Kardex movement
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
        movement.variantId = variant.id;
        movement.purchaseOrderId = savedPurchase.id;
        movement.quantity = qty;
        movement.type = 'IN';
        movement.reason = InventoryMovementReason.COMPRA;
        inventoryMovements.push(movement);
      }

      await movementRepo.save(inventoryMovements);
      return savedPurchase;
    });
  }
}
