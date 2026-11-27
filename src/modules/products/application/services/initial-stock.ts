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
 * Lote que comparten varias altas de una misma operación (una importación): una cabecera por sucursal, que se crea al
 * llegar la primera existencia, así que sin existencias no queda un lote vacío. Sirve solo dentro de su transacción.
 */
export class SharedInitialLot {
  private readonly headers = new Map<string, Batch>();

  constructor(private readonly code: string) {}

  async headerFor(manager: EntityManager, tenantId: string, branchId: string): Promise<Batch> {
    const existing = this.headers.get(branchId);
    if (existing) return existing;
    const header = await manager.getRepository(Batch).save(newHeader(tenantId, branchId, this.code));
    this.headers.set(branchId, header);
    return header;
  }
}

function newHeader(tenantId: string, branchId: string, code: string): Batch {
  const header = new Batch();
  header.tenantId = tenantId;
  header.branchId = branchId;
  header.purchaseOrderId = null;
  header.code = code;
  header.originType = BatchOriginType.INITIAL_STOCK;
  return header;
}

/** La cabecera de cada entrada: la del lote compartido o, sin él, una propia por variante y sucursal. */
async function headersFor(manager: EntityManager, tenantId: string, entries: readonly InitialStockEntry[], sharedLot: SharedInitialLot | undefined): Promise<Batch[]> {
  if (!sharedLot) {
    return manager.getRepository(Batch).save(entries.map((entry) => newHeader(tenantId, entry.branchId, `LOT-INIT-${entry.sku || entry.variantId.slice(0, 6)}`)));
  }
  const headers: Batch[] = [];
  for (const entry of entries) headers.push(await sharedLot.headerFor(manager, tenantId, entry.branchId));
  return headers;
}

/**
 * Deja constancia del stock con el que nace una variante: su capa en un lote de stock inicial (para el costo FIFO) y su
 * entrada en el kardex. El lote es propio de la variante salvo que se pase uno compartido. Las filas de `product_stocks`
 * ya las guarda la variante en cascada. Solo cuentan las cantidades positivas, y todo se inserta por lotes, no fila por fila.
 */
export async function recordInitialStock(manager: EntityManager, tenantId: string, entries: readonly InitialStockEntry[], sharedLot?: SharedInitialLot): Promise<void> {
  const received = entries.filter((entry) => Number(entry.quantity) > 0);
  if (received.length === 0) return;

  const headers = await headersFor(manager, tenantId, received, sharedLot);

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
