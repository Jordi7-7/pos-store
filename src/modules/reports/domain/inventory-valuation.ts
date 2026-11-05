import { Money } from '../../../common/domain/money';
import { subtractQuantities } from '../../../common/domain/quantity';

export interface StockValuationInput {
  /** Existencias de la variante (puede ser negativa si se vendió sin stock). */
  quantity: number;
  /** Unidades que siguen disponibles en lotes. */
  layersQuantity: number;
  /** Valor de esas unidades a su costo de lote. */
  layersValue: number;
  /** Costo vigente de la variante: valora lo que no respaldan los lotes. */
  currentCost: number;
}

export interface StockValuation {
  totalValue: number;
  /** Costo medio por unidad de lo que hay en existencia. */
  unitCost: number;
}

/**
 * Valor de las existencias de una variante con lo que realmente queda en sus lotes (costo FIFO), no
 * con un precio de referencia. Las unidades en stock que ningún lote respalda (datos antiguos) y la
 * deuda por ventas sin stock se valoran al costo vigente de la variante.
 */
export function valueStock(input: StockValuationInput): StockValuation {
  const currentCost = Money.of(input.currentCost);

  if (input.quantity <= 0) {
    return { totalValue: Money.ofLine(input.currentCost, input.quantity).toNumber(), unitCost: currentCost.toNumber() };
  }

  if (input.layersQuantity >= input.quantity) {
    // Los lotes cubren (o exceden) el stock: se valora en proporción a lo que realmente hay
    const covered = Money.of(input.layersValue).fraction(input.quantity, input.layersQuantity);
    return { totalValue: covered.toNumber(), unitCost: covered.fraction(1, input.quantity).toNumber() };
  }

  const unbacked = subtractQuantities(input.quantity, input.layersQuantity);
  const totalValue = Money.of(input.layersValue).plus(Money.ofLine(input.currentCost, unbacked));
  return { totalValue: totalValue.toNumber(), unitCost: totalValue.fraction(1, input.quantity).toNumber() };
}
