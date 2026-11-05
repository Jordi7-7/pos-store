import { cashDifference, expectedCashBalance, summarizeCashSession } from './cash-closing';
import { PaymentMethod } from '../entities/sale-payment.entity';

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

describe('summarizeCashSession', () => {
  const summarize = (input: Parameters<typeof summarizeCashSession>[0]) => summarizeCashSession(input);

  it('separa efectivo y tarjeta, resta devoluciones y suma gastos', () => {
    const totals = summarize({
      sales: [
        { total: '30.10', payments: [{ paymentMethod: PaymentMethod.EFECTIVO, amount: '10.10' }, { paymentMethod: PaymentMethod.TARJETA, amount: '20' }] },
        { total: 5, payments: [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 5 }] },
      ],
      expenseAmounts: ['2.50', 1],
      refundAmounts: ['4'],
    });

    expect(totals).toEqual({
      grossSales: 35.1,
      netSales: 31.1,
      cashSales: 15.1,
      cardSales: 20,
      totalExpenses: 3.5,
      totalRefunds: 4,
    });
  });

  it('suma importes decimales sin error de coma flotante', () => {
    const totals = summarize({
      sales: [{ total: 0.3, payments: [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 0.1 }, { paymentMethod: PaymentMethod.EFECTIVO, amount: 0.2 }] }],
      expenseAmounts: [],
      refundAmounts: [],
    });

    expect(totals.cashSales).toBe(0.3);
  });

  it('una venta sin pagos registrados cuenta como efectivo', () => {
    expect(summarize({ sales: [{ total: 12, payments: [] }], expenseAmounts: [], refundAmounts: [] }).cashSales).toBe(12);
  });

  it('las ventas netas no bajan de cero cuando se devuelve más de lo vendido en la sesión', () => {
    const totals = summarize({ sales: [{ total: 10, payments: [] }], expenseAmounts: [], refundAmounts: [25] });

    expect(totals.netSales).toBe(0);
    expect(totals.totalRefunds).toBe(25);
  });
});
