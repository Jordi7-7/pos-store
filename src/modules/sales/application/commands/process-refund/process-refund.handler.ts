import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProcessRefundCommand } from './process-refund.command';
import { Refund } from '../../../domain/entities/refund.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { RefundItem } from '../../../domain/entities/refund-item.entity';
import { Sale } from '../../../domain/entities/sale.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { CashSessionStatus } from '../../../domain/enums/cash-session-status.enum';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../../../products/domain/entities/product-batch.entity';
import { Batch, BatchOriginType } from '../../../../batches/domain/entities/batch.entity';

import { SaleItem } from '../../../domain/entities/sale-item.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { assertValidRefundRequests, planRefund, RefundPlan } from '../../../domain/services/refund-plan';
import { lockCashSession } from '../shared/cash-session-lock';
import { assertUserAssignedToCashRegister } from '../shared/cash-register-access';

@CommandHandler(ProcessRefundCommand)
export class ProcessRefundHandler implements ICommandHandler<ProcessRefundCommand> {
  private readonly logger = new Logger(ProcessRefundHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: ProcessRefundCommand): Promise<Refund> {
    const { tenantId, userId, branchId, saleId, cashSessionId, reason, items } = command;
    this.logger.log(`Processing refund for Sale ID: ${saleId} under Tenant: ${tenantId}`);

    try {
      assertValidRefundRequests(items);
    } catch (error) {
      this.logger.warn(`Refund rejected: invalid quantities for Sale ID ${saleId}`);
      throw error;
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      await assertUserCanOperateInBranch(transactionalManager, this.redisService, {
        tenantId,
        userId,
        branchId,
        actionDescription: 'registrar devoluciones',
      });

      // 1. Grouped Repository Initialization (Pattern 3)
      const branchRepo = transactionalManager.getRepository(Branch);
      const cashSessionRepo = transactionalManager.getRepository(CashSession);
      const saleRepo = transactionalManager.getRepository(Sale);
      const saleItemRepo = transactionalManager.getRepository(SaleItem);
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

      await lockCashSession(transactionalManager, cashSessionId, 'share');

      // 3. Validate Cash Session is active and open
      const cashSession = await cashSessionRepo.findOne({
        where: {
          id: cashSessionId,
          status: CashSessionStatus.OPEN,
          branch: { id: branchId, tenantId },
        },
        relations: { branch: true },
      });
      if (!cashSession) {
        this.logger.warn(`Refund failed: active cash session ${cashSessionId} not found or closed in Branch ${branchId}`);
        throw new BadRequestException('Active cash session not found for this branch');
      }

      await assertUserAssignedToCashRegister(transactionalManager, {
        tenantId,
        userId,
        cashRegisterId: cashSession.cashRegisterId,
        actionDescription: 'registrar devoluciones',
      });

      // 4. Bloquear la fila de la venta: dos devoluciones simultáneas de la misma venta se
      //    serializan y la segunda ve las cantidades ya devueltas por la primera.
      await saleRepo.findOne({
        where: { id: saleId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      // 4.1 Validate Sale exists under tenant and load its items (allows cross-branch returns)
      const sale = await saleRepo.findOne({
        where: { id: saleId, tenantId },
        relations: { items: true },
      });
      if (!sale) {
        this.logger.warn(`Refund failed: Sale ID ${saleId} not found for Tenant ${tenantId}`);
        throw new NotFoundException(`Sale with ID ${saleId} not found`);
      }

      if (sale.status === 'REFUNDED') {
        throw new BadRequestException(`La venta ${sale.invoiceNumber || saleId} ya ha sido devuelta en su totalidad.`);
      }

      let plan: RefundPlan<SaleItem>;
      try {
        plan = planRefund(sale.items, items);
      } catch (error) {
        this.logger.warn(`Refund rejected for Sale ID ${saleId}: ${error instanceof Error ? error.message : 'unknown'}`);
        throw error;
      }

      const refundItemsToSave: RefundItem[] = [];
      const inventoryMovements: InventoryMovement[] = [];

      // 5. Registrar cada parte de la devolución sobre su línea de venta
      for (const { line: saleItem, quantity, refundedQuantityAfter, unitPrice } of plan.allocations) {
        const { variantId } = saleItem;

        const refundItem = new RefundItem();
        refundItem.variantId = variantId;
        refundItem.quantity = quantity;
        refundItem.priceRefunded = unitPrice;
        refundItemsToSave.push(refundItem);

        saleItem.refundedQuantity = refundedQuantityAfter;
        await saleItemRepo.save(saleItem);

        // Restore branch inventory stock (locked for concurrent updates)
        let stock = await stockRepo.findOne({
          where: { branchId, variantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!stock) {
          stock = new ProductStock();
          stock.branchId = branchId;
          stock.variantId = variantId;
          stock.quantity = 0;
        }

        const previousStock = Number(stock.quantity);
        const negativeDebt = previousStock < 0 ? Math.abs(previousStock) : 0;
        const remainingForFutureSales = Math.max(0, quantity - negativeDebt);

        stock.quantity = previousStock + quantity;
        await stockRepo.save(stock);

        // Create Batch header for the returned merchandise
        const batchHeaderRepo = transactionalManager.getRepository(Batch);
        const batchHeader = new Batch();
        batchHeader.tenantId = tenantId;
        batchHeader.branchId = branchId;
        batchHeader.purchaseOrderId = null;
        batchHeader.code = `DEV-${sale.invoiceNumber || sale.id.slice(0, 6)}`;
        batchHeader.originType = BatchOriginType.REFUND;
        batchHeader.notes = reason || 'Devolución de cliente';
        const savedBatchHeader = await batchHeaderRepo.save(batchHeader);

        // Create a new Product Batch representing the returned inventory (using historical cost)
        const batch = new ProductBatch();
        batch.tenantId = tenantId;
        batch.branchId = branchId;
        batch.batchId = savedBatchHeader.id;
        batch.variantId = variantId;
        batch.initialQuantity = quantity;
        batch.remainingQuantity = remainingForFutureSales;
        batch.unitCost = Number(saleItem.cost) || 0;
        await batchRepo.save(batch);

        // Build Kardex entry
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
        movement.variantId = variantId;
        movement.quantity = quantity;
        movement.type = InventoryMovementType.IN;
        movement.reason = InventoryMovementReason.DEVOLUCION;
        inventoryMovements.push(movement);
      }

      // 6. Create and save Refund
      const refund = new Refund();
      refund.tenantId = tenantId;
      refund.branchId = branchId;
      refund.saleId = saleId;
      refund.cashSessionId = cashSessionId;
      refund.totalRefunded = plan.totalRefunded;
      refund.reason = reason;
      refund.userId = userId || null;
      refund.items = refundItemsToSave;

      const savedRefund = await refundRepo.save(refund);
      await inventoryRepo.save(inventoryMovements);

      // 6. Update Sale status based on refundedQuantity of sale.items
      const isFullRefund = sale.items.every((si) =>
        Number(si.refundedQuantity || 0) >= Number(si.quantity)
      );
      sale.status = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await saleRepo.save(sale);

      this.logger.log(`Refund processed successfully: ID ${savedRefund.id}, Total Refunded: $${savedRefund.totalRefunded}. Sale ${saleId} status updated to: ${sale.status}`);

      return savedRefund;
    });
  }
}
