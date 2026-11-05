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
