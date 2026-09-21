import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, MoreThan } from 'typeorm';
import { AdjustStockCommand } from './adjust-stock.command';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';

@CommandHandler(AdjustStockCommand)
export class AdjustStockHandler implements ICommandHandler<AdjustStockCommand> {
  private readonly logger = new Logger(AdjustStockHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: AdjustStockCommand): Promise<any> {
    const { tenantId, branchId, variantId, quantity, type, comment } = command;
    this.logger.log(
      `Executing stock adjustment: Type ${type}, Qty ${quantity} for Variant ${variantId} on Branch ${branchId}`,
    );

    if (quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const stockRepo = transactionalManager.getRepository(ProductStock);
      const batchRepo = transactionalManager.getRepository(ProductBatch);
      const movementRepo = transactionalManager.getRepository(InventoryMovement);
      const branchRepo = transactionalManager.getRepository(Branch);

      // Verify branch exists and belongs to tenant
      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        throw new NotFoundException(`La sucursal con ID ${branchId} no existe para este tenant.`);
      }

      // Verify variant exists and belongs to tenant
      const variant = await variantRepo.findOne({
        where: { id: variantId, product: { tenantId } },
        relations: { product: true },
      });
      if (!variant) {
        throw new NotFoundException(`La variante del producto con ID ${variantId} no existe.`);
      }

      // Get or create product stock record
      let branchStock = await stockRepo.findOne({
        where: { branchId, variantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!branchStock) {
        branchStock = new ProductStock();
        branchStock.branchId = branchId;
        branchStock.variantId = variantId;
        branchStock.quantity = 0;
      }

      // Adjust stock quantity & batches
      if (type === InventoryMovementType.OUT) {
        const currentStock = Number(branchStock.quantity);
        if (currentStock < quantity) {
          throw new BadRequestException(
            `Stock insuficiente en la sucursal ${branch.name}. Stock actual: ${currentStock}, solicitado: ${quantity}.`,
          );
        }
        branchStock.quantity = currentStock - quantity;

        // Consumir lotes FIFO activos de esta variante y sucursal
        let remainingToDeduct = quantity;
        const activeBatches = await batchRepo.find({
          where: {
            tenantId,
            branchId,
            variantId,
            remainingQuantity: MoreThan(0),
          },
          order: { createdAt: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });

        for (const batch of activeBatches) {
          const toDeduct = Math.min(remainingToDeduct, Number(batch.remainingQuantity));
          batch.remainingQuantity = Number(batch.remainingQuantity) - toDeduct;
          await batchRepo.save(batch);
          remainingToDeduct -= toDeduct;

          if (remainingToDeduct === 0) break;
        }
      } else {
        branchStock.quantity = Number(branchStock.quantity) + quantity;

        // Crear un nuevo lote de entrada con el costo unitario de la ficha
        const newBatch = new ProductBatch();
        newBatch.tenantId = tenantId;
        newBatch.branchId = branchId;
        newBatch.variantId = variantId;
        newBatch.purchaseOrderId = null;
        newBatch.initialQuantity = quantity;
        newBatch.remainingQuantity = quantity;
        newBatch.unitCost = Number(variant.purchasePrice) || 0;
        await batchRepo.save(newBatch);
      }

      await stockRepo.save(branchStock);

      // Create Inventory Movement (Kardex)
      const movement = new InventoryMovement();
      movement.tenantId = tenantId;
      movement.variantId = variantId;
      movement.quantity = quantity;
      movement.type = type;
      movement.reason = InventoryMovementReason.ADJUSTMENT;

      if (type === InventoryMovementType.IN) {
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
      } else {
        movement.originBranchId = branchId;
        movement.destinationBranchId = null;
      }

      this.logger.log(`Stock adjustment recorded with comment: ${comment || 'No comment'}`);

      await movementRepo.save(movement);

      return {
        success: true,
        newQuantity: branchStock.quantity,
        movementId: movement.id,
      };
    });
  }
}
export default AdjustStockHandler;
