import { DomainError } from '../../../../common/domain/domain.error';
import { Money } from '../../../../common/domain/money';
import { ErrorCode } from '../../../../common/errors/error-codes';

export interface SaleLineAmounts {
  quantity: number;
  price: number;
  /** Descuento total de la línea (no por unidad). */
  discountAmount?: number;
}

export interface PricedSaleLine {
  subtotal: number;
  discountAmount: number;
  globalDiscountAmount: number;
  total: number;
}

export interface SalePricing {
  lines: PricedSaleLine[];
  subtotal: number;
  itemsDiscountAmount: number;
  globalDiscountAmount: number;
  discountAmount: number;
  total: number;
}

function invalidAmounts(message: string): DomainError {
  return new DomainError(ErrorCode.InvalidSaleAmounts, message);
}

interface LineBase {
  gross: Money;
  discount: Money;
  net: Money;
}

function priceLineBase(line: SaleLineAmounts): LineBase {
  if (!(line.quantity > 0)) throw invalidAmounts('La cantidad de cada producto debe ser mayor a 0.');
  if (!(line.price >= 0)) throw invalidAmounts('El precio de un producto no puede ser negativo.');

  const gross = Money.ofLine(line.price, line.quantity);
  const discount = Money.of(line.discountAmount ?? 0);
  if (discount.isNegative()) throw invalidAmounts('El descuento de un producto no puede ser negativo.');
  if (discount.greaterThan(gross)) throw invalidAmounts('El descuento de un producto no puede superar su importe.');

  return { gross, discount, net: gross.minus(discount) };
}

/**
 * Calcula los importes de una venta y valida sus invariantes:
 * - cantidades positivas, precios y descuentos no negativos;
 * - el descuento de una línea no supera su importe;
 * - el descuento global no supera la base tras descuentos de línea (el total nunca es negativo).
 *
 * El descuento global se prorratea entre las líneas según su base, y las líneas siempre suman
 * exactamente el total de la venta.
 *
 * Una misma variante PUEDE aparecer en varias líneas: el POS añade una línea por cada alta,
 * con su propio precio y descuento.
 */
export function priceSale(lines: readonly SaleLineAmounts[], globalDiscountAmount = 0): SalePricing {
  if (lines.length === 0) throw invalidAmounts('La venta debe incluir al menos un producto.');

  const bases = lines.map(priceLineBase);
  const subtotal = Money.sum(bases.map((base) => base.gross));
  const itemsDiscount = Money.sum(bases.map((base) => base.discount));
  const netBase = Money.sum(bases.map((base) => base.net));

  const globalDiscount = Money.of(globalDiscountAmount);
  if (globalDiscount.isNegative()) throw invalidAmounts('El descuento global no puede ser negativo.');
  if (globalDiscount.greaterThan(netBase)) throw invalidAmounts('El descuento global no puede superar el total de la venta.');

  const proratedDiscounts = globalDiscount.allocate(bases.map((base) => base.net));

  return {
    lines: bases.map((base, index) => ({
      subtotal: base.gross.toNumber(),
      discountAmount: base.discount.toNumber(),
      globalDiscountAmount: proratedDiscounts[index].toNumber(),
      total: base.net.minus(proratedDiscounts[index]).toNumber(),
    })),
    subtotal: subtotal.toNumber(),
    itemsDiscountAmount: itemsDiscount.toNumber(),
    globalDiscountAmount: globalDiscount.toNumber(),
    discountAmount: itemsDiscount.plus(globalDiscount).toNumber(),
    total: netBase.minus(globalDiscount).toNumber(),
  };
}

/** Los pagos registrados deben cubrir el total de la venta. */
export function assertPaymentsCoverTotal(saleTotal: number, paymentAmounts: readonly number[]): void {
  const total = Money.of(saleTotal);
  const paid = Money.sum(paymentAmounts.map((amount) => Money.of(amount)));

  if (paid.lessThan(total)) {
    throw new DomainError(
      ErrorCode.InsufficientPayment,
      `El monto pagado ($${paid.toString()}) es menor al total de la venta ($${total.toString()}).`,
      { paid: paid.toNumber(), total: total.toNumber() },
    );
  }
}

/**
 * Lo que de cada pago se aplica al total de la venta. Lo que excede el total es vuelto, no ingreso:
 * se recorta primero del efectivo (lo único que se devuelve en mano). Así lo registrado en
 * `sale_payments` nunca supera el total y el efectivo esperado en caja no se infla con el vuelto.
 * Conserva el orden original y descarta los pagos que quedan en cero.
 */
export function allocatePayments<T extends { paymentMethod: string; amount: number }>(saleTotal: number, payments: readonly T[]): T[] {
  let budget = Money.of(saleTotal);
  const applied = new Map<T, Money>();

  // Primero lo que no es efectivo (no admite vuelto); el efectivo cubre lo que falte
  const byPriority = [...payments].sort((a, b) => Number(a.paymentMethod === 'EFECTIVO') - Number(b.paymentMethod === 'EFECTIVO'));
  for (const payment of byPriority) {
    const amount = Money.of(payment.amount);
    const part = amount.lessThan(budget) ? amount : budget;
    applied.set(payment, part);
    budget = budget.minus(part);
  }

  return payments
    .map((payment) => ({ ...payment, amount: (applied.get(payment) ?? Money.ZERO).toNumber() }))
    .filter((payment) => payment.amount > 0);
}
