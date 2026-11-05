import { cashDifference, expectedCashBalance } from './cash-closing';

describe('expectedCashBalance', () => {
  it('suma apertura y ventas, y resta gastos y devoluciones', () => {
    expect(expectedCashBalance({ openingBalance: 50, cashSales: 100, expenses: 10, refunds: 5 })).toBe(135);
  });

  it('es exacto con céntimos', () => {
    expect(expectedCashBalance({ openingBalance: 0.1, cashSales: 0.2, expenses: 0, refunds: 0 })).toBe(0.3);
  });

  it('puede ser negativo si salió más efectivo del que entró', () => {
    expect(expectedCashBalance({ openingBalance: 0, cashSales: 0, expenses: 10, refunds: 0 })).toBe(-10);
  });
});

describe('cashDifference', () => {
  it.each([
    [130, 135, -5],
    [140, 135, 5],
    [135, 135, 0],
    [100.1, 100.3, -0.2],
  ])('cierre %p con esperado %p = %p', (closing, expected, difference) => {
    expect(cashDifference(closing, expected)).toBe(difference);
  });
});
