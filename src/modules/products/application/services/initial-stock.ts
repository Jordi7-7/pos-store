import { EntityManager } from 'typeorm';
import { Batch, BatchOriginType } from '../../../batches/domain/entities/batch.entity';
import { InventoryMovementCategory } from '../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementReason } from '../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../domain/entities/product-batch.entity';
import { newKardexLine } from './kardex';

export interface InitialStockEntry {
  branchId: string;
  variantId: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
}

/**
 * Deja constancia del stock con el que nace una variante: un lote de stock inicial por sucursal (para
 * el costo FIFO) y su entrada en el kardex. Las filas de `product_stocks` ya las guarda la variante en
 * cascada. Solo cuentan las cantidades positivas, y todo se inserta por lotes, no fila por fila.
 */
export async function recordInitialStock(manager: EntityManager, tenantId: string, entries: readonly InitialStockEntry[]): Promise<void> {
  const received = entries.filter((entry) => Number(entry.quantity) > 0);
  if (received.length === 0) return;

  const headers = await manager.getRepository(Batch).save(
    received.map((entry) => {
      const header = new Batch();
      header.tenantId = tenantId;
      header.branchId = entry.branchId;
      header.purchaseOrderId = null;
      header.code = `LOT-INIT-${entry.sku || entry.variantId.slice(0, 6)}`;
      header.originType = BatchOriginType.INITIAL_STOCK;
      return header;
    }),
  );

  await manager.getRepository(ProductBatch).save(
    received.map((entry, index) => {
      const batch = new ProductBatch();
      batch.tenantId = tenantId;
      batch.branchId = entry.branchId;
      batch.batchId = headers[index].id;
      batch.variantId = entry.variantId;
      batch.initialQuantity = Number(entry.quantity);
      batch.remainingQuantity = Number(entry.quantity);
      batch.unitCost = entry.unitCost;
      return batch;
    }),
  );

  // La fila de stock nace con esa cantidad, así que el saldo tras el movimiento es la propia cantidad
  await manager.getRepository(InventoryMovement).save(
    received.map((entry) =>
      newKardexLine({
        tenantId,
        variantId: entry.variantId,
        quantity: Number(entry.quantity),
        type: InventoryMovementType.IN,
        category: InventoryMovementCategory.INITIAL,
        reason: InventoryMovementReason.INITIAL_STOCK,
        branchId: entry.branchId,
        unitCost: entry.unitCost,
        balanceAfter: Number(entry.quantity),
      }),
    ),
  );
}
