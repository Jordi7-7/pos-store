import { Money } from '../../../../common/domain/money';
import { addQuantities, subtractQuantities } from '../../../../common/domain/quantity';

export interface FifoBatch {
  remainingQuantity: number;
  unitCost: number;
}

export interface FifoConsumption<Batch extends FifoBatch> {
  batch: Batch;
  quantity: number;
  remainingAfter: number;
}

export interface FifoPlan<Batch extends FifoBatch> {
  consumptions: FifoConsumption<Batch>[];
  /** Costo unitario promedio de lo consumido, para calcular el margen de la venta. */
  averageUnitCost: number;
}

/**
 * Consume `quantity` de los lotes en el orden recibido (el más antiguo primero). Lo que los
 * lotes no cubran se valora a `fallbackUnitCost`: una venta puede dejar el stock en negativo.
 */
export function planFifoConsumption<Batch extends FifoBatch>(
  batches: readonly Batch[],
  quantity: number,
  fallbackUnitCost: number,
): FifoPlan<Batch> {
  const consumptions: FifoConsumption<Batch>[] = [];
  const costs: Money[] = [];
  let pending = quantity;

  for (const batch of batches) {
    if (pending <= 0) break;

    const consumed = Math.min(pending, batch.remainingQuantity);
    if (consumed <= 0) continue;

    consumptions.push({ batch, quantity: consumed, remainingAfter: subtractQuantities(batch.remainingQuantity, consumed) });
    costs.push(Money.ofLine(batch.unitCost, consumed));
    pending = subtractQuantities(pending, consumed);
  }

  if (pending > 0) costs.push(Money.ofLine(fallbackUnitCost, pending));

  return { consumptions, averageUnitCost: Money.sum(costs).fraction(1, quantity).toNumber() };
}

export interface StockEntry {
  newStock: number;
  /** Unidades del nuevo lote disponibles para futuras ventas. */
  batchRemainingQuantity: number;
}

/**
 * Una entrada primero salda el stock negativo: esas unidades ya se vendieron, así que el nuevo
 * lote solo conserva lo que sobra tras cubrir la deuda.
 */
export function applyStockEntry(previousStock: number, quantity: number): StockEntry {
  const debt = previousStock < 0 ? -previousStock : 0;
  return {
    newStock: addQuantities(previousStock, quantity),
    batchRemainingQuantity: Math.max(0, subtractQuantities(quantity, debt)),
  };
}

export interface WeightedCostInput {
  currentStock: number;
  currentCost: number;
  incomingQuantity: number;
  incomingCost: number;
}

/** Precio medio ponderado (PMP). El stock negativo no aporta valor, cuenta como 0. */
export function weightedAverageCost(input: WeightedCostInput): number {
  const { currentCost, incomingQuantity, incomingCost } = input;
  const currentStock = Math.max(0, input.currentStock);
  const totalQuantity = addQuantities(currentStock, incomingQuantity);
  if (totalQuantity <= 0) return Money.of(incomingCost).toNumber();

  return Money.ofLine(currentCost, currentStock)
    .plus(Money.ofLine(incomingCost, incomingQuantity))
    .fraction(1, totalQuantity)
    .toNumber();
}

export interface RemainingCostInput {
  /** Lotes que siguen con unidades en existencia (todas las sucursales). */
  layers: readonly FifoBatch[];
  /** Existencias totales de la variante después del cambio (todas las sucursales). */
  stockAfter: number;
  /** Costo vigente: valora las unidades que existen pero no están en ningún lote (datos antiguos). */
  currentCost: number;
}

/**
 * Costo promedio de lo que realmente queda en existencia, a partir de sus lotes. Se usa al anular una
 * compra: no se "resta" matemáticamente su aporte (las ventas posteriores ya movieron el stock sin tocar
 * el costo), se revalúa lo que queda. Sin unidades en existencia se conserva el costo vigente.
 */
export function costFromRemainingLayers(input: RemainingCostInput): number {
  const layersQuantity = input.layers.reduce((sum, layer) => addQuantities(sum, layer.remainingQuantity), 0);
  const layersValue = Money.sum(input.layers.map((layer) => Money.ofLine(layer.unitCost, layer.remainingQuantity)));
  // Unidades que hay en stock pero ningún lote respalda: se valoran al costo vigente
  const unbacked = Math.max(0, subtractQuantities(Math.max(0, input.stockAfter), layersQuantity));

  const totalQuantity = addQuantities(layersQuantity, unbacked);
  if (totalQuantity <= 0) return Money.of(input.currentCost).toNumber();

  return layersValue.plus(Money.ofLine(input.currentCost, unbacked)).fraction(1, totalQuantity).toNumber();
}
