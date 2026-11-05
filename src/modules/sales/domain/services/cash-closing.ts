import { Money } from '../../../../common/domain/money';

export interface CashDrawerMovements {
  openingBalance: number;
  cashSales: number;
  expenses: number;
  refunds: number;
}

/** Efectivo que debería haber en caja: apertura + ventas en efectivo - gastos - devoluciones. */
export function expectedCashBalance(movements: CashDrawerMovements): number {
  return Money.of(movements.openingBalance)
    .plus(Money.of(movements.cashSales))
    .minus(Money.of(movements.expenses))
    .minus(Money.of(movements.refunds))
    .toNumber();
}

/** Diferencia del arqueo: positiva si sobra efectivo, negativa si falta. */
export function cashDifference(closingBalance: number, expectedBalance: number): number {
  return Money.of(closingBalance).minus(Money.of(expectedBalance)).toNumber();
}

export interface SessionSalePayment {
  paymentMethod: string;
  amount: number | string | null;
}

export interface SessionSale {
  total: number | string | null;
  payments: readonly SessionSalePayment[];
}

export interface CashSessionTotals {
  grossSales: number;
  netSales: number;
  cashSales: number;
  cardSales: number;
  totalExpenses: number;
  totalRefunds: number;
}

const CASH = 'EFECTIVO';
const CARD = 'TARJETA';

/**
 * Totales de una sesión de caja. Una venta sin pagos registrados (datos antiguos) se considera
 * cobrada en efectivo por su total. Las ventas netas nunca bajan de cero.
 */
export function summarizeCashSession(input: {
  sales: readonly SessionSale[];
  expenseAmounts: ReadonlyArray<number | string | null>;
  refundAmounts: ReadonlyArray<number | string | null>;
}): CashSessionTotals {
  let gross = Money.ZERO;
  let cash = Money.ZERO;
  let card = Money.ZERO;

  for (const sale of input.sales) {
    const total = Money.of(sale.total ?? 0);
    gross = gross.plus(total);

    if (sale.payments.length === 0) {
      cash = cash.plus(total);
      continue;
    }
    for (const payment of sale.payments) {
      const amount = Money.of(payment.amount ?? 0);
      if (payment.paymentMethod === CARD) card = card.plus(amount);
      else if (payment.paymentMethod === CASH) cash = cash.plus(amount);
    }
  }

  const expenses = Money.sum(input.expenseAmounts.map((amount) => Money.of(amount ?? 0)));
  const refunds = Money.sum(input.refundAmounts.map((amount) => Money.of(amount ?? 0)));
  const net = gross.minus(refunds);

  return {
    grossSales: gross.toNumber(),
    netSales: net.isNegative() ? 0 : net.toNumber(),
    cashSales: cash.toNumber(),
    cardSales: card.toNumber(),
    totalExpenses: expenses.toNumber(),
    totalRefunds: refunds.toNumber(),
  };
}
