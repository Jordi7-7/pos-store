import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProcessRefundCommand } from './process-refund.command';
import { Refund } from '../../../domain/entities/refund.entity';
import { RefundItem } from '../../../domain/entities/refund-item.entity';
import { Sale } from '../../../domain/entities/sale.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../../../products/domain/entities/product-batch.entity';

@CommandHandler(ProcessRefundCommand)
export class ProcessRefundHandler implements ICommandHandler<ProcessRefundCommand> {
  private readonly logger = new Logger(ProcessRefundHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: ProcessRefundCommand): Promise<Refund> {
    const { tenantId, branchId, saleId, cashSessionId, reason, items } = command;
    this.logger.log(`Processing refund for Sale ID: ${saleId} under Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      // 1. Grouped Repository Initialization (Pattern 3)
      const branchRepo = transactionalManager.getRepository(Branch);
      const cashSessionRepo = transactionalManager.getRepository(CashSession);
      const saleRepo = transactionalManager.getRepository(Sale);
      const stockRepo = transactionalManager.getRepository(ProductStock);
      const refundRepo = transactionalManager.getRepository(Refund);
      const inventoryRepo = transactionalManager.getRepository(InventoryMovement);
      const batchRepo = transactionalManager.getRepository(ProductBatch);

      // 2. Validate Branch belongs to Tenant
      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        this.logger.warn(`Refund failed: Branch ID ${branchId} not found under Tenant ${tenantId}`);
        throw new NotFoundException(`Branch with ID ${branchId} not found`);
      }

      // 3. Validate Cash Session is active and open
      const cashSession = await cashSessionRepo.findOne({
        where: {
          id: cashSessionId,
          status: 'OPEN',
          branch: { id: branchId, tenantId },
        },
        relations: { branch: true },
      });
      if (!cashSession) {
        this.logger.warn(`Refund failed: active cash session ${cashSessionId} not found or closed in Branch ${branchId}`);
        throw new BadRequestException('Active cash session not found for this branch');
      }

      // 4. Validate Sale exists, belongs to branch and tenant, and load its items
      const sale = await saleRepo.findOne({
        where: { id: saleId, branchId, tenantId },
        relations: { items: true },
      });
      if (!sale) {
        this.logger.warn(`Refund failed: Sale ID ${saleId} not found in Branch ${branchId} for Tenant ${tenantId}`);
        throw new NotFoundException(`Sale with ID ${saleId} not found`);
      }

      let totalRefunded = 0;
      const refundItemsToSave: RefundItem[] = [];
      const inventoryMovements: InventoryMovement[] = [];

      // 5. Validate and process refund items
      for (const itemDto of items) {
        // Find matching item in original sale
        const saleItem = sale.items.find((si) => si.variantId === itemDto.variantId);
        if (!saleItem) {
          this.logger.warn(`Refund failed: Variant ID ${itemDto.variantId} was not part of Sale ID ${saleId}`);
          throw new BadRequestException(`Product variant ${itemDto.variantId} was not purchased in this sale`);
        }

        // Validate quantity does not exceed original sold quantity
        if (itemDto.quantity > Number(saleItem.quantity)) {
          this.logger.warn(`Refund failed: refund quantity (${itemDto.quantity}) exceeds sold quantity (${saleItem.quantity})`);
          throw new BadRequestException(`Refund quantity for variant ${itemDto.variantId} exceeds the original sold quantity`);
        }

        // Calculate refund amount for this variant
        const priceRefunded = Number(saleItem.price) * itemDto.quantity;
        totalRefunded += priceRefunded;

        // Build Refund Item record
        const refundItem = new RefundItem();
        refundItem.variantId = itemDto.variantId;
        refundItem.quantity = itemDto.quantity;
        refundItem.priceRefunded = Number(saleItem.price);
        refundItemsToSave.push(refundItem);

        // Restore branch inventory stock (locked for concurrent updates)
        let stock = await stockRepo.findOne({
          where: { branchId, variantId: itemDto.variantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!stock) {
          stock = new ProductStock();
          stock.branchId = branchId;
          stock.variantId = itemDto.variantId;
          stock.quantity = 0;
        }

        stock.quantity = Number(stock.quantity) + itemDto.quantity;
        await stockRepo.save(stock);

        // Create a new Product Batch representing the returned inventory (using historical cost)
        const batch = new ProductBatch();
        batch.tenantId = tenantId;
        batch.branchId = branchId;
        batch.variantId = itemDto.variantId;
        batch.purchaseOrderId = null; // returned stock, not new PO
        batch.initialQuantity = itemDto.quantity;
        batch.remainingQuantity = itemDto.quantity;
        batch.unitCost = Number(saleItem.cost);
        await batchRepo.save(batch);

        // Build Kardex entry
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
        movement.variantId = itemDto.variantId;
        movement.quantity = itemDto.quantity;
        movement.type = 'IN';
        movement.reason = 'DEVOLUCION';
        inventoryMovements.push(movement);
      }

      // 6. Create and save Refund
      const refund = new Refund();
      refund.tenantId = tenantId;
      refund.branchId = branchId;
      refund.saleId = saleId;
      refund.cashSessionId = cashSessionId;
      refund.totalRefunded = totalRefunded;
      refund.reason = reason;
      refund.items = refundItemsToSave;

      const savedRefund = await refundRepo.save(refund);
      await inventoryRepo.save(inventoryMovements);

      this.logger.log(`Refund processed successfully: ID ${savedRefund.id}, Total Refunded: $${savedRefund.totalRefunded}`);

      return savedRefund;
    });
  }
}
