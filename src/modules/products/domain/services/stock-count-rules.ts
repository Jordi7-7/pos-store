import { subtractQuantities, addQuantities } from '../../../../common/domain/quantity';

/** Una línea de conteo: lo contado y lo que el sistema decía cuando el usuario la agregó. */
export interface CountLine {
  variantId: string;
  counted: number;
  expected: number;
  /** Costo de lo que sobra (solo cuando el conteo suma). Sin él, el costo de compra de la variante. */
  unitCost?: number;
}

export interface CountAdjustment {
  variantId: string;
  /** Cantidad positiva a sumar (`IN`) o restar (`OUT`). */
  quantity: number;
  type: 'IN' | 'OUT';
  unitCost?: number;
}

export interface StockCountPlan {
  adjustments: CountAdjustment[];
  /** Líneas cuyo stock actual ya no es el que veía el usuario (hubo ventas, compras u otros movimientos). */
  changed: Array<{ variantId: string; expected: number; current: number }>;
  /** Líneas que dejarían el stock en negativo al restar la diferencia al stock actual. */
  negative: Array<{ variantId: string; current: number; difference: number }>;
}

/**
 * La diferencia es lo contado menos lo que el usuario veía (no menos el stock de ahora): se aplica sobre el stock
 * actual, así lo vendido mientras se contaba no se pisa. Contó 10, veía 12 y entre tanto se vendió 1 (stock 11):
 * la diferencia es −2 y el stock queda en 9, que es lo que de verdad hay (10 contadas − 1 vendida).
 * Las líneas sin diferencia no generan movimiento.
 */
export function planStockCount(lines: readonly CountLine[], currentStock: ReadonlyMap<string, number>): StockCountPlan {
  const plan: StockCountPlan = { adjustments: [], changed: [], negative: [] };
  for (const line of lines) {
    const difference = subtractQuantities(line.counted, line.expected);
    if (difference === 0) continue;
    const current = currentStock.get(line.variantId) ?? 0;
    if (current !== line.expected) plan.changed.push({ variantId: line.variantId, expected: line.expected, current });
    if (addQuantities(current, difference) < 0) plan.negative.push({ variantId: line.variantId, current, difference });
    plan.adjustments.push({ variantId: line.variantId, quantity: Math.abs(difference), type: difference > 0 ? 'IN' : 'OUT', unitCost: line.unitCost });
  }
  return plan;
}

/** Variantes que aparecen más de una vez: en un conteo es ambiguo (¿cuál es lo contado?), así que se rechaza. */
export function duplicatedVariants(lines: readonly CountLine[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { variantId } of lines) (seen.has(variantId) ? repeated : seen).add(variantId);
  return [...repeated];
}
