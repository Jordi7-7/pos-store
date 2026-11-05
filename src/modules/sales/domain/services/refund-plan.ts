import { DomainError } from '../../../../common/domain/domain.error';
import { Money } from '../../../../common/domain/money';
import { addQuantities, subtractQuantities } from '../../../../common/domain/quantity';
import { ErrorCode } from '../../../../common/errors/error-codes';

export interface RefundableLine {
  variantId: string;
  quantity: number;
  price: number;
  refundedQuantity: number;
  discountAmount: number;
  globalDiscountAmount: number;
  total: number;
}

export interface RefundRequest {
  variantId: string;
  quantity: number;
}

export interface RefundAllocation<Line extends RefundableLine> {
  line: Line;
  quantity: number;
  /** Cantidad devuelta de la línea tras esta devolución. */
  refundedQuantityAfter: number;
  amount: number;
  /** Precio neto unitario de lo devuelto, redondeado: solo informativo. */
  unitPrice: number;
}

export interface RefundPlan<Line extends RefundableLine> {
  allocations: RefundAllocation<Line>[];
  totalRefunded: number;
}

function invalidRefund(message: string): DomainError {
  return new DomainError(ErrorCode.InvalidRefund, message);
}

/** Lo que el cliente pagó por la línea. Las ventas antiguas no guardaban `total` (queda en 0). */
function paidForLine(line: RefundableLine): Money {
  if (line.total > 0) return Money.of(line.total);

  const net = Money.ofLine(line.price, line.quantity)
    .minus(Money.of(line.discountAmount))
    .minus(Money.of(line.globalDiscountAmount));
  return net.isNegative() ? Money.ZERO : net;
}

/**
 * Importe de devolver `quantity` unidades cuando ya se devolvieron `alreadyRefunded`. Se calcula
 * sobre lo acumulado para que varias devoluciones parciales sumen justo lo pagado:
 * 3 unidades por $10.00 devuelven $3.33, $3.34 y $3.33, y no $3.33 x 3 = $9.99.
 */
function refundAmount(line: RefundableLine, alreadyRefunded: number, quantity: number): Money {
  const paid = paidForLine(line);
  const refundedAfter = addQuantities(alreadyRefunded, quantity);
  return paid.fraction(refundedAfter, line.quantity).minus(paid.fraction(alreadyRefunded, line.quantity));
}

/** Validación que no necesita la venta: permite rechazar la petición antes de abrir una transacción. */
export function assertValidRefundRequests(requests: readonly RefundRequest[]): void {
  if (requests.length === 0 || requests.some((request) => !(request.quantity > 0))) {
    throw invalidRefund('La devolución debe incluir productos con cantidades mayores a 0.');
  }
}

/**
 * Decide qué líneas de la venta cubren cada devolución. Una variante puede estar en varias
 * líneas, con precios distintos: se consumen en orden hasta completar la cantidad pedida.
 */
export function planRefund<Line extends RefundableLine>(
  lines: readonly Line[],
  requests: readonly RefundRequest[],
): RefundPlan<Line> {
  assertValidRefundRequests(requests);

  const refundedSoFar = new Map<Line, number>(lines.map((line) => [line, line.refundedQuantity]));
  const allocations: RefundAllocation<Line>[] = [];

  for (const request of requests) {
    const candidates = lines.filter((line) => line.variantId === request.variantId);
    if (candidates.length === 0) {
      throw invalidRefund(`Product variant ${request.variantId} was not purchased in this sale`);
    }

    const available = candidates.reduce(
      (total, line) => addQuantities(total, Math.max(0, subtractQuantities(line.quantity, refundedSoFar.get(line) ?? 0))),
      0,
    );
    if (request.quantity > available) {
      throw invalidRefund(
        `No se puede devolver ${request.quantity} pieza(s). Solo quedan ${available} pieza(s) disponible(s) para devolución de este producto en la venta.`,
      );
    }

    let pending = request.quantity;
    for (const line of candidates) {
      if (pending <= 0) break;

      const alreadyRefunded = refundedSoFar.get(line) ?? 0;
      const quantity = Math.min(pending, subtractQuantities(line.quantity, alreadyRefunded));
      if (quantity <= 0) continue;

      const amount = refundAmount(line, alreadyRefunded, quantity);
      const refundedQuantityAfter = addQuantities(alreadyRefunded, quantity);
      allocations.push({
        line,
        quantity,
        refundedQuantityAfter,
        amount: amount.toNumber(),
        unitPrice: amount.fraction(1, quantity).toNumber(),
      });
      refundedSoFar.set(line, refundedQuantityAfter);
      pending = subtractQuantities(pending, quantity);
    }
  }

  return {
    allocations,
    totalRefunded: Money.sum(allocations.map((allocation) => Money.of(allocation.amount))).toNumber(),
  };
}
