import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AdjustStockCommand } from './adjust-stock.command';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';

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

      // Adjust stock quantity
      if (type === 'OUT') {
        const currentStock = Number(branchStock.quantity);
        if (currentStock < quantity) {
          throw new BadRequestException(
            `Stock insuficiente en la sucursal ${branch.name}. Stock actual: ${currentStock}, solicitado: ${quantity}.`,
          );
        }
        branchStock.quantity = currentStock - quantity;
      } else {
        branchStock.quantity = Number(branchStock.quantity) + quantity;
      }

      await stockRepo.save(branchStock);

      // Create Inventory Movement (Kardex)
      const movement = new InventoryMovement();
      movement.tenantId = tenantId;
      movement.variantId = variantId;
      movement.quantity = quantity;
      movement.type = type;
      movement.reason = InventoryMovementReason.ADJUSTMENT;

      if (type === 'IN') {
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
      } else {
        movement.originBranchId = branchId;
        movement.destinationBranchId = null;
      }

      // Append comment/note to the movement if provided (we can append to reason or we can extend DB if field exists. Since DB doesn't have comment field, we can log in comments or append to the DB if we add it, but it's safer to not modify schema and simply log it or log inside logger)
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
