import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CancelPurchaseOrderCommand } from './cancel-purchase-order.command';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../../../domain/entities/purchase-order-item.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { ProductBatch } from '../../../../products/domain/entities/product-batch.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';

@CommandHandler(CancelPurchaseOrderCommand)
export class CancelPurchaseOrderHandler
  implements ICommandHandler<CancelPurchaseOrderCommand>
{
  private readonly logger = new Logger(CancelPurchaseOrderHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CancelPurchaseOrderCommand): Promise<void> {
    const { tenantId, purchaseOrderId } = command;

    this.logger.log(
      `Cancelling purchase order ${purchaseOrderId} for tenant ${tenantId}`,
    );

    await this.entityManager.transaction(async (tm) => {
      const purchaseRepo = tm.getRepository(PurchaseOrder);
      const itemRepo = tm.getRepository(PurchaseOrderItem);
      const stockRepo = tm.getRepository(ProductStock);
      const batchRepo = tm.getRepository(ProductBatch);
      const movementRepo = tm.getRepository(InventoryMovement);

      // 1. Find and validate the purchase order
      const order = await purchaseRepo.findOne({
        where: { id: purchaseOrderId, tenantId },
        relations: { items: true },
      });

      if (!order) {
        throw new NotFoundException(
          `Purchase order with ID ${purchaseOrderId} not found`,
        );
      }

      if (order.status === 'CANCELLED') {
        throw new BadRequestException(
          `Purchase order ${purchaseOrderId} is already cancelled`,
        );
      }

      if (order.status !== 'COMPLETED') {
        throw new BadRequestException(
          `Only COMPLETED purchase orders can be cancelled`,
        );
      }

      // 2. Verify no items have been sold: all batches must be fully intact
      const batches = await batchRepo.find({
        where: { purchaseOrderId },
      });

      for (const batch of batches) {
        const initial = Number(batch.initialQuantity);
        const remaining = Number(batch.remainingQuantity);
        if (remaining < initial) {
          throw new ConflictException(
            `Cannot cancel this purchase order because some units from this batch have already been sold. ` +
              `Batch ${batch.id}: ${initial - remaining} unit(s) already consumed.`,
          );
        }
      }

      // 3. For each order item, reverse the stock and create compensatory Kardex entry
      const movements: InventoryMovement[] = [];

      for (const item of order.items) {
        // Decrement branch stock (pessimistic lock to avoid race conditions)
        const branchStock = await stockRepo.findOne({
          where: { branchId: order.branchId, variantId: item.variantId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!branchStock) {
          throw new NotFoundException(
            `Stock record not found for variant ${item.variantId} in branch ${order.branchId}`,
          );
        }

        const newQty = Number(branchStock.quantity) - Number(item.quantity);
        if (newQty < 0) {
          throw new ConflictException(
            `Insufficient stock to cancel: variant ${item.variantId} would go negative`,
          );
        }

        branchStock.quantity = newQty;
        await stockRepo.save(branchStock);

        // Zero out all batches for this item in this order
        const itemBatches = batches.filter(
          (b) => b.variantId === item.variantId,
        );
        for (const batch of itemBatches) {
          batch.remainingQuantity = 0;
          await batchRepo.save(batch);
        }

        // Compensatory Kardex movement (OUT - not a loss, explicitly a purchase cancellation)
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = order.branchId;
        movement.destinationBranchId = null;
        movement.variantId = item.variantId;
        movement.quantity = Number(item.quantity);
        movement.type = 'OUT';
        movement.reason = InventoryMovementReason.ANULACION_COMPRA;
        movement.purchaseOrderId = purchaseOrderId;
        movements.push(movement);
      }

      await movementRepo.save(movements);

      // 4. Mark order as cancelled
      order.status = 'CANCELLED';
      await purchaseRepo.save(order);

      this.logger.log(
        `Purchase order ${purchaseOrderId} successfully cancelled. Stock reversed for ${order.items.length} variant(s).`,
      );
    });
  }
}
