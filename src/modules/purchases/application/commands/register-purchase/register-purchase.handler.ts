import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RegisterPurchaseCommand } from './register-purchase.command';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';

@CommandHandler(RegisterPurchaseCommand)
export class RegisterPurchaseHandler implements ICommandHandler<RegisterPurchaseCommand> {
  private readonly logger = new Logger(RegisterPurchaseHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: RegisterPurchaseCommand): Promise<PurchaseOrder> {
    const { tenantId, supplierId, branchId, invoiceNumber, items } = command;
    this.logger.log(`Registering purchase order from Supplier: ${supplierId} in Branch: ${branchId} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      // 1. Grouped Repository Initialization (Pattern 3)
      const supplierRepo = transactionalManager.getRepository(Supplier);
      const branchRepo = transactionalManager.getRepository(Branch);
      const purchaseRepo = transactionalManager.getRepository(PurchaseOrder);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const stockRepo = transactionalManager.getRepository(ProductStock);
      const inventoryRepo = transactionalManager.getRepository(InventoryMovement);

      // 2. Validate Supplier belongs to Tenant
      const supplier = await supplierRepo.findOne({
        where: { id: supplierId, tenantId },
      });
      if (!supplier) {
        this.logger.warn(`Purchase failed: Supplier ID ${supplierId} not found under Tenant ${tenantId}`);
        throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
      }

      // 3. Validate Branch belongs to Tenant
      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        this.logger.warn(`Purchase failed: Branch ID ${branchId} not found under Tenant ${tenantId}`);
        throw new NotFoundException(`Branch with ID ${branchId} not found`);
      }

      // 4. Calculate total amount
      let totalAmount = 0;
      for (const itemDto of items) {
        totalAmount += itemDto.quantity * itemDto.purchasePrice;
      }

      // 5. Create Purchase Order
      const purchaseOrder = new PurchaseOrder();
      purchaseOrder.tenantId = tenantId;
      purchaseOrder.supplierId = supplierId;
      purchaseOrder.branchId = branchId;
      purchaseOrder.invoiceNumber = invoiceNumber || null;
      purchaseOrder.totalAmount = totalAmount;
      purchaseOrder.status = 'COMPLETED';

      const savedPurchase = await purchaseRepo.save(purchaseOrder);
      const inventoryMovements: InventoryMovement[] = [];

      // 6. Process items (Update PMP cost and add branch stocks)
      for (const itemDto of items) {
        // Validate variant exists and belongs to this tenant
        const variant = await variantRepo.findOne({
          where: {
            id: itemDto.variantId,
            product: { tenantId },
          },
          relations: { product: true },
        });
        if (!variant) {
          this.logger.warn(`Purchase failed: Variant ID ${itemDto.variantId} not found for Tenant ${tenantId}`);
          throw new NotFoundException(`Product Variant with ID ${itemDto.variantId} not found`);
        }

        // Get total stock across all branches to calculate PMP
        const stocks = await stockRepo.find({
          where: { variantId: itemDto.variantId },
        });
        const currentTotalStock = stocks.reduce((sum, s) => sum + Number(s.quantity), 0);

        // Recalculate Weighted Average Cost (PMP)
        const currentStock = currentTotalStock > 0 ? currentTotalStock : 0;
        const currentCost = Number(variant.purchasePrice);
        const newQty = itemDto.quantity;
        const newPrice = itemDto.purchasePrice;

        const newCost = (currentStock * currentCost + newQty * newPrice) / (currentStock + newQty);
        
        // Update variant purchase price
        variant.purchasePrice = Number(newCost.toFixed(2));
        await variantRepo.save(variant);

        // Find or create product stock in the target branch (locked for concurrent updates)
        let branchStock = await stockRepo.findOne({
          where: { branchId, variantId: itemDto.variantId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!branchStock) {
          branchStock = new ProductStock();
          branchStock.branchId = branchId;
          branchStock.variantId = itemDto.variantId;
          branchStock.quantity = 0;
        }

        branchStock.quantity = Number(branchStock.quantity) + newQty;
        await stockRepo.save(branchStock);

        // Create Kardex entry
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
        movement.variantId = itemDto.variantId;
        movement.quantity = newQty;
        movement.type = 'IN';
        movement.reason = 'COMPRA';
        movement.purchaseOrderId = savedPurchase.id;
        inventoryMovements.push(movement);
      }

      await inventoryRepo.save(inventoryMovements);
      this.logger.log(`Purchase order processed successfully: ID ${savedPurchase.id}, Total: ${savedPurchase.totalAmount}`);

      return savedPurchase;
    });
  }
}
