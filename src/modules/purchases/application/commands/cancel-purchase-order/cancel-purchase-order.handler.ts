import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager, MoreThan } from 'typeorm';
import { lockBranchStock } from '../../../../products/application/services/inventory-stock';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { CancelPurchaseOrderCommand } from './cancel-purchase-order.command';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../../../domain/entities/purchase-order-item.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { ProductBatch } from '../../../../products/domain/entities/product-batch.entity';
import { Batch, BatchStatus } from '../../../../batches/domain/entities/batch.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { costFromRemainingLayers } from '../../../../products/domain/services/stock-rules';
import { PurchaseOrderStatus } from '../../../../purchases/domain/enums/purchase-order-status.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';

@CommandHandler(CancelPurchaseOrderCommand)
export class CancelPurchaseOrderHandler
  implements ICommandHandler<CancelPurchaseOrderCommand>
{
  private readonly logger = new Logger(CancelPurchaseOrderHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: CancelPurchaseOrderCommand): Promise<void> {
    const { tenantId, userId, purchaseOrderId } = command;

    this.logger.log(
      `Cancelling purchase order ${purchaseOrderId} for tenant ${tenantId}`,
    );

    await this.entityManager.transaction(async (tm) => {
      const purchaseRepo = tm.getRepository(PurchaseOrder);
      const itemRepo = tm.getRepository(PurchaseOrderItem);
      const stockRepo = tm.getRepository(ProductStock);
      const batchRepo = tm.getRepository(ProductBatch);
      const movementRepo = tm.getRepository(InventoryMovement);
      const batchHeaderRepo = tm.getRepository(Batch);

      // Bloquea la orden: dos cancelaciones simultáneas no pueden revertir el stock dos veces
      await tm.query(`SELECT "id" FROM "purchase_orders" WHERE "id" = $1 AND "tenant_id" = $2 FOR UPDATE`, [purchaseOrderId, tenantId]);

      // 1. Find and validate the purchase order
      const order = await purchaseRepo.findOne({
        where: { id: purchaseOrderId, tenantId },
        relations: { items: true },
      });

      if (!order) {
        throw new AppException(ErrorCode.PurchaseOrderNotFound, 'Orden de compra no encontrada.', HttpStatus.NOT_FOUND, { purchaseOrderId });
      }

      await assertUserCanOperateInBranch(tm, this.redisService, {
        tenantId,
        userId,
        branchId: order.branchId,
        actionDescription: 'cancelar compras',
      });

      if (order.status === PurchaseOrderStatus.CANCELLED) {
        throw new AppException(ErrorCode.PurchaseOrderAlreadyCancelled, 'La orden de compra ya está cancelada.', HttpStatus.CONFLICT, { purchaseOrderId });
      }

      if (order.status !== PurchaseOrderStatus.COMPLETED) {
        throw new AppException(ErrorCode.PurchaseOrderNotCancellable, 'Solo se pueden cancelar órdenes de compra completadas.', HttpStatus.CONFLICT);
      }

      // Bloquea las filas de stock (en orden fijo) ANTES de leer los lotes: una venta simultánea no puede
      // consumir unidades entre la comprobación de lotes intactos y la reversión del stock.
      const variantIds = [...new Set(order.items.map((item) => item.variantId))].sort();
      for (const variantId of variantIds) {
        await lockBranchStock(tm, order.branchId, variantId);
      }

      // 2. Verify no items have been sold: all batches must be fully intact
      const batchHeaders = await batchHeaderRepo.find({
        where: { purchaseOrderId },
        relations: { items: true },
      });
      const batches = batchHeaders.flatMap((bh) => bh.items || []);

      for (const batch of batches) {
        const initial = Number(batch.initialQuantity);
        const remaining = Number(batch.remainingQuantity);
        if (remaining < initial) {
          throw new AppException(ErrorCode.PurchaseBatchAlreadySold, `No se puede cancelar la orden de compra porque ya se vendieron ${initial - remaining} unidad(es) de uno de sus lotes.`, HttpStatus.CONFLICT, { batchId: batch.id, consumed: initial - remaining });
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
          throw new AppException(ErrorCode.StockRecordNotFound, 'No existe registro de stock de la variante en la sucursal de la orden.', HttpStatus.NOT_FOUND, { variantId: item.variantId, branchId: order.branchId });
        }

        const newQty = Number(branchStock.quantity) - Number(item.quantity);
        if (newQty < 0) {
          throw new AppException(ErrorCode.InsufficientStock, 'No hay stock suficiente para cancelar: la variante quedaría en negativo.', HttpStatus.CONFLICT, { variantId: item.variantId });
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
        movement.type = InventoryMovementType.OUT;
        movement.reason = InventoryMovementReason.ANULACION_COMPRA;
        movement.purchaseOrderId = purchaseOrderId;
        movements.push(movement);
      }

      await movementRepo.save(movements);

      // El costo promedio deja de incluir esta compra: se revalúa con lo que sigue en existencia
      for (const variantId of variantIds) {
        await this.revalueCost(tm, tenantId, variantId);
      }

      // 4. Mark all batch headers associated with this purchase order as CANCELLED
      for (const batchHeader of batchHeaders) {
        batchHeader.status = BatchStatus.CANCELLED;
        await batchHeaderRepo.save(batchHeader);
      }

      // 5. Mark order as cancelled
      order.status = PurchaseOrderStatus.CANCELLED;
      await purchaseRepo.save(order);

      this.logger.log(
        `Purchase order ${purchaseOrderId} successfully cancelled. Stock reversed for ${order.items.length} variant(s).`,
      );
    });
  }

  /** Recalcula el costo de la variante (precio medio ponderado) a partir de los lotes que quedan en existencia. */
  private async revalueCost(tm: EntityManager, tenantId: string, variantId: string): Promise<void> {
    const variantRepo = tm.getRepository(ProductVariant);
    const variant = await variantRepo.findOne({ where: { id: variantId, tenantId } });
    if (!variant) return;

    const [layers, stocks] = await Promise.all([
      tm.getRepository(ProductBatch).find({ where: { tenantId, variantId, remainingQuantity: MoreThan(0) } }),
      tm.getRepository(ProductStock).find({ where: { variantId } }),
    ]);
    variant.purchasePrice = costFromRemainingLayers({
      layers: layers.map((layer) => ({ remainingQuantity: Number(layer.remainingQuantity), unitCost: Number(layer.unitCost) })),
      stockAfter: stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0),
      currentCost: Number(variant.purchasePrice),
    });
    await variantRepo.save(variant);
  }
}
