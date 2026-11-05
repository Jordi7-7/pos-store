import { EntityManager, MoreThan } from 'typeorm';
import { ProductBatch } from '../../domain/entities/product-batch.entity';
import { ProductStock } from '../../domain/entities/product-stock.entity';
import { subtractQuantities } from '../../../../common/domain/quantity';
import { applyStockEntry, planFifoConsumption } from '../../domain/services/stock-rules';

/**
 * Operaciones de stock compartidas por ventas, devoluciones, compras y ajustes. Reciben el
 * `EntityManager` de la transacción en curso, así que el movimiento se confirma o revierte
 * junto con la operación que lo origina.
 */

/**
 * Devuelve la fila de stock bloqueada, creándola si no existe. Crearla antes de bloquear evita
 * que dos operaciones simultáneas sobre una variante sin stock choquen con el índice único.
 */
export async function lockBranchStock(manager: EntityManager, branchId: string, variantId: string): Promise<ProductStock> {
  await manager.query(
    `INSERT INTO "product_stocks" ("branch_id", "variant_id", "quantity")
     VALUES ($1, $2, 0)
     ON CONFLICT ("branch_id", "variant_id") DO NOTHING`,
    [branchId, variantId],
  );

  return manager.getRepository(ProductStock).findOneOrFail({
    where: { branchId, variantId },
    lock: { mode: 'pessimistic_write' },
  });
}

export interface ConsumeStockInput {
  branchId: string;
  variantId: string;
  quantity: number;
  /** Costo con el que se valora lo que no cubran los lotes. */
  fallbackUnitCost: number;
}

export interface ConsumedStock {
  averageUnitCost: number;
  newStock: number;
}

/** Descuenta stock y lotes FIFO. El stock puede quedar en negativo: el llamador decide si lo permite. */
export async function consumeStock(manager: EntityManager, input: ConsumeStockInput): Promise<ConsumedStock> {
  const { branchId, variantId, quantity, fallbackUnitCost } = input;
  const batchRepo = manager.getRepository(ProductBatch);

  const stock = await lockBranchStock(manager, branchId, variantId);
  stock.quantity = subtractQuantities(stock.quantity, quantity);
  await manager.getRepository(ProductStock).save(stock);

  const batches = await batchRepo.find({
    where: { branchId, variantId, remainingQuantity: MoreThan(0) },
    order: { createdAt: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });

  const plan = planFifoConsumption(batches, quantity, fallbackUnitCost);
  for (const { batch, remainingAfter } of plan.consumptions) {
    batch.remainingQuantity = remainingAfter;
    await batchRepo.save(batch);
  }

  return { averageUnitCost: plan.averageUnitCost, newStock: stock.quantity };
}

export interface ReceiveStockInput {
  tenantId: string;
  branchId: string;
  variantId: string;
  /** Cabecera del lote (`batches`) a la que pertenece esta entrada. */
  batchId: string;
  quantity: number;
  unitCost: number;
}

/** Registra una entrada de stock y su lote FIFO. Primero salda la deuda de stock negativo. */
export async function receiveStock(manager: EntityManager, input: ReceiveStockInput): Promise<number> {
  const { tenantId, branchId, variantId, batchId, quantity, unitCost } = input;

  const stock = await lockBranchStock(manager, branchId, variantId);
  const entry = applyStockEntry(stock.quantity, quantity);
  stock.quantity = entry.newStock;
  await manager.getRepository(ProductStock).save(stock);

  const batch = new ProductBatch();
  batch.tenantId = tenantId;
  batch.branchId = branchId;
  batch.batchId = batchId;
  batch.variantId = variantId;
  batch.initialQuantity = quantity;
  batch.remainingQuantity = entry.batchRemainingQuantity;
  batch.unitCost = unitCost;
  await manager.getRepository(ProductBatch).save(batch);

  return entry.newStock;
}
