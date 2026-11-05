import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { AdjustStockCommand } from './adjust-stock.command';
import { consumeStock, lockBranchStock, receiveStock } from '../../services/inventory-stock';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { Batch, BatchOriginType } from '../../../../batches/domain/entities/batch.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';

export interface AdjustStockResult {
  success: boolean;
  newQuantity: number;
  movementId: string;
}

@CommandHandler(AdjustStockCommand)
export class AdjustStockHandler implements ICommandHandler<AdjustStockCommand> {
  private readonly logger = new Logger(AdjustStockHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: AdjustStockCommand): Promise<AdjustStockResult> {
    const { tenantId, userId, branchId, variantId, quantity, type, comment } = command;
    this.logger.log(
      `Executing stock adjustment: Type ${type}, Qty ${quantity} for Variant ${variantId} on Branch ${branchId}`,
    );

    if (quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a 0');
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      await assertUserCanOperateInBranch(transactionalManager, this.redisService, {
        tenantId,
        userId,
        branchId,
        actionDescription: 'ajustar stock',
      });

      const variantRepo = transactionalManager.getRepository(ProductVariant);
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

      let newQuantity: number;

      if (type === InventoryMovementType.OUT) {
        // Un ajuste de salida, a diferencia de una venta, no puede dejar el stock en negativo
        const branchStock = await lockBranchStock(transactionalManager, branchId, variantId);
        if (branchStock.quantity < quantity) {
          this.logger.warn(`Stock adjustment rejected: insufficient stock for Variant ${variantId} on Branch ${branchId}`);
          throw new BadRequestException(
            `Stock insuficiente en la sucursal ${branch.name}. Stock actual: ${branchStock.quantity}, solicitado: ${quantity}.`,
          );
        }

        const consumed = await consumeStock(transactionalManager, {
          branchId,
          variantId,
          quantity,
          fallbackUnitCost: variant.purchasePrice,
        });
        newQuantity = consumed.newStock;
      } else {
        // Crear cabecera de lote para el ajuste de entrada
        const batchHeaderRepo = transactionalManager.getRepository(Batch);
        const batchHeader = new Batch();
        batchHeader.tenantId = tenantId;
        batchHeader.branchId = branchId;
        batchHeader.purchaseOrderId = null;
        batchHeader.code = `AJUSTE-IN-${Date.now().toString().slice(-6)}`;
        batchHeader.originType = BatchOriginType.ADJUSTMENT;
        batchHeader.notes = comment || null;
        const savedBatchHeader = await batchHeaderRepo.save(batchHeader);

        newQuantity = await receiveStock(transactionalManager, {
          tenantId,
          branchId,
          variantId,
          batchId: savedBatchHeader.id,
          quantity,
          unitCost: variant.purchasePrice || 0,
        });
      }

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
        newQuantity,
        movementId: movement.id,
      };
    });
  }
}
export default AdjustStockHandler;
