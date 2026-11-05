import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../../../../common/domain/money';
import { receiveStock } from '../../../../products/application/services/inventory-stock';
import { weightedAverageCost } from '../../../../products/domain/services/stock-rules';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { RegisterPurchaseCommand } from './register-purchase.command';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { PurchaseOrderItem } from '../../../domain/entities/purchase-order-item.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { Batch, BatchOriginType } from '../../../../batches/domain/entities/batch.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { PurchaseOrderStatus } from '../../../../purchases/domain/enums/purchase-order-status.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(RegisterPurchaseCommand)
export class RegisterPurchaseHandler implements ICommandHandler<RegisterPurchaseCommand> {
  private readonly logger = new Logger(RegisterPurchaseHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: RegisterPurchaseCommand): Promise<PurchaseOrder> {
    const { tenantId, userId, supplierId, branchId, invoiceNumber, items } = command;
    this.logger.log(`Registering purchase order from Supplier: ${supplierId} in Branch: ${branchId} for Tenant: ${tenantId}`);

    if (items.length === 0) {
      throw new AppException(ErrorCode.EmptyPurchase, 'La compra debe tener al menos un producto.', HttpStatus.BAD_REQUEST);
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      await assertUserCanOperateInBranch(transactionalManager, this.redisService, {
        tenantId,
        userId,
        branchId,
        actionDescription: 'registrar compras',
      });

      // 1. Grouped Repository Initialization (Pattern 3)
      const supplierRepo = transactionalManager.getRepository(Supplier);
      const branchRepo = transactionalManager.getRepository(Branch);
      const purchaseRepo = transactionalManager.getRepository(PurchaseOrder);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const stockRepo = transactionalManager.getRepository(ProductStock);
      const inventoryRepo = transactionalManager.getRepository(InventoryMovement);
      const batchHeaderRepo = transactionalManager.getRepository(Batch);
      const purchaseOrderItemRepo = transactionalManager.getRepository(PurchaseOrderItem);

      // 2. Resolve Supplier
      let supplier: Supplier | null = null;
      if (supplierId) {
        supplier = await supplierRepo.findOne({
          where: { id: supplierId, tenantId },
        });
        if (!supplier) {
          this.logger.warn(`Purchase failed: Supplier ID ${supplierId} not found under Tenant ${tenantId}`);
          throw new AppException(ErrorCode.SupplierNotFound, 'Proveedor no encontrado.', HttpStatus.NOT_FOUND, { supplierId });
        }
      } else {
        supplier = await supplierRepo.findOne({
          where: { identityNumber: 'GENERICO', tenantId },
        });
        if (!supplier) {
          // fallback to any supplier for tenant if generic one is missing
          supplier = await supplierRepo.findOne({
            where: { tenantId },
          });
        }
        if (!supplier) {
          this.logger.warn(`Purchase failed: No supplier found or provided under Tenant ${tenantId}`);
          throw new AppException(ErrorCode.SupplierNotFound, 'Proveedor no encontrado.', HttpStatus.NOT_FOUND);
        }
      }

      // 3. Validate Branch belongs to Tenant
      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        this.logger.warn(`Purchase failed: Branch ID ${branchId} not found under Tenant ${tenantId}`);
        throw new AppException(ErrorCode.BranchNotFound, 'Sucursal no encontrada.', HttpStatus.NOT_FOUND, { branchId });
      }

      // 4. Calculate total amount
      const totalAmount = Money.sum(items.map((item) => Money.ofLine(item.purchasePrice, item.quantity))).toNumber();

      // 5. Create Purchase Order (Stock Input)
      const purchaseOrder = new PurchaseOrder();
      purchaseOrder.tenantId = tenantId;
      purchaseOrder.supplierId = supplier.id;
      purchaseOrder.branchId = branchId;
      purchaseOrder.invoiceNumber = invoiceNumber || null;
      purchaseOrder.totalAmount = totalAmount;
      purchaseOrder.status = PurchaseOrderStatus.COMPLETED;

      const savedPurchase = await purchaseRepo.save(purchaseOrder);
      const inventoryMovements: InventoryMovement[] = [];

      // Create physical Batch header for this purchase
      const batchHeader = new Batch();
      batchHeader.tenantId = tenantId;
      batchHeader.branchId = branchId;
      batchHeader.purchaseOrderId = savedPurchase.id;
      batchHeader.code = invoiceNumber || `OC-${savedPurchase.id.slice(0, 8)}`;
      batchHeader.originType = BatchOriginType.PURCHASE;
      const savedBatchHeader = await batchHeaderRepo.save(batchHeader);

      // 6. Process items (Update PMP cost and add branch stocks).
      //    Siempre en el mismo orden (por variante): dos compras con las mismas variantes en distinto
      //    orden bloquearían las filas en orden cruzado (deadlock).
      const itemsInLockOrder = [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));
      for (const itemDto of itemsInLockOrder) {
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
          throw new AppException(ErrorCode.VariantNotFound, 'Variante no encontrada.', HttpStatus.NOT_FOUND, { variantId: itemDto.variantId });
        }

        // Get total stock across all branches to calculate PMP
        const stocks = await stockRepo.find({
          where: { variantId: itemDto.variantId },
        });
        const currentTotalStock = stocks.reduce((sum, s) => sum + Number(s.quantity), 0);

        const newQty = itemDto.quantity;
        const newPrice = itemDto.purchasePrice;

        // Recalculate Weighted Average Cost (PMP)
        variant.purchasePrice = weightedAverageCost({
          currentStock: currentTotalStock,
          currentCost: variant.purchasePrice,
          incomingQuantity: newQty,
          incomingCost: newPrice,
        });
        await variantRepo.save(variant);

        await receiveStock(transactionalManager, {
          tenantId,
          branchId,
          variantId: itemDto.variantId,
          batchId: savedBatchHeader.id,
          quantity: newQty,
          unitCost: newPrice,
        });

        // Save Purchase Order Item
        const purchaseOrderItem = new PurchaseOrderItem();
        purchaseOrderItem.purchaseOrderId = savedPurchase.id;
        purchaseOrderItem.variantId = itemDto.variantId;
        purchaseOrderItem.quantity = newQty;
        purchaseOrderItem.purchasePrice = newPrice;
        await purchaseOrderItemRepo.save(purchaseOrderItem);

        // Create Kardex entry
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
        movement.variantId = itemDto.variantId;
        movement.quantity = newQty;
        movement.type = 'IN';
        movement.reason = InventoryMovementReason.COMPRA;
        movement.purchaseOrderId = savedPurchase.id;
        inventoryMovements.push(movement);
      }

      await inventoryRepo.save(inventoryMovements);
      this.logger.log(`Purchase order processed successfully: ID ${savedPurchase.id}, Total: ${savedPurchase.totalAmount}`);

      return savedPurchase;
    });
  }
}
