import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Money } from '../../../../../common/domain/money';
import { receiveStock } from '../../../../products/application/services/inventory-stock';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { ImportPurchasesCommand } from './import-purchases.command';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../../../domain/entities/purchase-order-item.entity';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { Batch, BatchOriginType } from '../../../../batches/domain/entities/batch.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { PurchaseOrderStatus } from '../../../../purchases/domain/enums/purchase-order-status.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { normalizeSku } from '../../../../products/domain/sku';

@CommandHandler(ImportPurchasesCommand)
export class ImportPurchasesHandler implements ICommandHandler<ImportPurchasesCommand> {
  private readonly logger = new Logger(ImportPurchasesHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: ImportPurchasesCommand): Promise<PurchaseOrder> {
    const { tenantId, userId, branchId, items, invoiceNumber } = command;
    const cleanInvoiceNumber = invoiceNumber?.trim() || null;
    this.logger.log(`Executing bulk purchase import: ${items.length} items for Branch: ${branchId}`);

    if (items.length === 0) {
      throw new AppException(ErrorCode.ImportEmpty, 'No se proporcionaron registros para importar.', HttpStatus.BAD_REQUEST);
    }

    if (items.length > 3000) {
      throw new AppException(ErrorCode.ImportLimitExceeded, `El archivo contiene ${items.length} filas. El límite máximo permitido por importación es de 3,000 registros.`, HttpStatus.BAD_REQUEST, { received: items.length, max: 3000 });
    }

    return this.entityManager.transaction(async (tm) => {
      await assertUserCanOperateInBranch(tm, this.redisService, {
        tenantId,
        userId,
        branchId,
        actionDescription: 'importar compras',
      });

      const purchaseRepo = tm.getRepository(PurchaseOrder);
      const itemRepo = tm.getRepository(PurchaseOrderItem);
      const supplierRepo = tm.getRepository(Supplier);
      const branchRepo = tm.getRepository(Branch);
      const variantRepo = tm.getRepository(ProductVariant);
      const batchHeaderRepo = tm.getRepository(Batch);
      const movementRepo = tm.getRepository(InventoryMovement);

      // Verify branch exists
      const branch = await branchRepo.findOne({ where: { id: branchId, tenantId } });
      if (!branch) {
        throw new AppException(ErrorCode.BranchNotFound, `La sucursal destino con ID ${branchId} no existe.`, HttpStatus.NOT_FOUND, { branchId });
      }

      // Resolve supplier (by supplierId or default to GENERICO)
      let supplier: Supplier | null = null;
      if (command.supplierId) {
        supplier = await supplierRepo.findOne({ where: { id: command.supplierId, tenantId } });
        if (!supplier) {
          throw new AppException(ErrorCode.SupplierNotFound, `El proveedor seleccionado con ID ${command.supplierId} no existe.`, HttpStatus.NOT_FOUND, { supplierId: command.supplierId });
        }
      } else {
        supplier = await supplierRepo.findOne({ where: { identityNumber: 'GENERICO', tenantId } });
        if (!supplier) {
          supplier = await supplierRepo.findOne({ where: { tenantId } });
        }
        if (!supplier) {
          throw new AppException(ErrorCode.DefaultSupplierNotFound, 'No se encontró un proveedor configurado para este tenant.', HttpStatus.NOT_FOUND);
        }
      }

      // Resolve all variants in batch to check existence
      const skus = items.map((it) => normalizeSku(it.sku));
      const variants = await variantRepo.find({
        where: { sku: In(skus), tenantId },
      });

      const variantMap = new Map(variants.map((v) => [normalizeSku(v.sku), v]));

      // Verify all SKUs exist
      const missingSkus: string[] = [];
      for (const sku of skus) {
        if (!variantMap.has(sku)) {
          missingSkus.push(sku);
        }
      }

      if (missingSkus.length > 0) {
        throw new AppException(ErrorCode.SkusNotFound, `Los siguientes SKUs no existen en el catálogo: ${missingSkus.join(', ')}`, HttpStatus.NOT_FOUND, { skus: missingSkus });
      }

      // Verify all items have positive quantities
      for (const itemDto of items) {
        if (Number(itemDto.quantity) <= 0) {
          throw new AppException(ErrorCode.InvalidQuantity, `La cantidad para el SKU ${itemDto.sku} debe ser mayor a 0.`, HttpStatus.BAD_REQUEST, { sku: itemDto.sku });
        }
      }

      // Calculate total purchase amount
      const totalAmount = Money.sum(
        items.map((item) => Money.ofLine(variantMap.get(normalizeSku(item.sku))!.purchasePrice || 0, item.quantity)),
      ).toNumber();

      // Create main PurchaseOrder
      const purchaseOrder = new PurchaseOrder();
      purchaseOrder.tenantId = tenantId;
      purchaseOrder.supplierId = supplier.id;
      purchaseOrder.branchId = branchId;
      purchaseOrder.invoiceNumber = cleanInvoiceNumber || 'IMP-MASIVO';
      purchaseOrder.totalAmount = totalAmount;
      purchaseOrder.status = PurchaseOrderStatus.COMPLETED;
      const savedPurchase = await purchaseRepo.save(purchaseOrder);

      // Create physical Batch header for this imported purchase
      const batchHeader = new Batch();
      batchHeader.tenantId = tenantId;
      batchHeader.branchId = branchId;
      batchHeader.purchaseOrderId = savedPurchase.id;
      batchHeader.code = cleanInvoiceNumber ? `IMP-${cleanInvoiceNumber}` : 'COMPRA-MASIVA';
      batchHeader.originType = BatchOriginType.PURCHASE;
      const savedBatchHeader = await batchHeaderRepo.save(batchHeader);

      const inventoryMovements: InventoryMovement[] = [];

      // Siempre en el mismo orden (por variante) para no bloquear las filas de stock en orden cruzado
      const itemsInLockOrder = [...items].sort((a, b) =>
        variantMap.get(normalizeSku(a.sku))!.id.localeCompare(variantMap.get(normalizeSku(b.sku))!.id),
      );
      for (const itemDto of itemsInLockOrder) {
        const variant = variantMap.get(normalizeSku(itemDto.sku))!;
        const qty = Number(itemDto.quantity);
        const cost = Number(variant.purchasePrice || 0);

        // Save Item
        const orderItem = new PurchaseOrderItem();
        orderItem.purchaseOrderId = savedPurchase.id;
        orderItem.variantId = variant.id;
        orderItem.quantity = qty;
        orderItem.purchasePrice = cost;
        await itemRepo.save(orderItem);

        await receiveStock(tm, {
          tenantId,
          branchId,
          variantId: variant.id,
          batchId: savedBatchHeader.id,
          quantity: qty,
          unitCost: cost,
        });

        // Create Kardex movement
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = null;
        movement.destinationBranchId = branchId;
        movement.variantId = variant.id;
        movement.purchaseOrderId = savedPurchase.id;
        movement.quantity = qty;
        movement.type = InventoryMovementType.IN;
        movement.reason = InventoryMovementReason.COMPRA;
        inventoryMovements.push(movement);
      }

      await movementRepo.save(inventoryMovements);
      return savedPurchase;
    });
  }
}
