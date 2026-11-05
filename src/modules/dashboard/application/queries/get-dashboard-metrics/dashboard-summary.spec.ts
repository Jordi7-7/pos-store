import { buildPaymentMethods, buildToday, buildTopProducts, buildWeekSummary } from './dashboard-summary';
import { PaymentMethod } from '../../../../sales/domain/entities/sale-payment.entity';

describe('buildToday', () => {
  it('descuenta lo devuelto para obtener las ventas netas', () => {
    const today = buildToday(
      { totalSales: '120.50', itemsCount: '9' },
      { totalRefunded: '20.25', refundedItemsCount: '2', refundsCount: '1' },
    );

    expect(today).toEqual({
      totalSales: 120.5,
      itemsCount: 9,
      netSales: 100.25,
      netItemsCount: 7,
      refunds: { totalRefunded: 20.25, itemsCount: 2, count: 1 },
    });
  });

  it('las ventas netas nunca son negativas (devolución de ventas de otro día)', () => {
    const today = buildToday({ totalSales: '10', itemsCount: '1' }, { totalRefunded: '30', refundedItemsCount: '3', refundsCount: '1' });

    expect(today.netSales).toBe(0);
    expect(today.netItemsCount).toBe(0);
  });

  it('sin ventas ni devoluciones todo es cero', () => {
    expect(buildToday(undefined, undefined)).toEqual({
      totalSales: 0,
      itemsCount: 0,
      netSales: 0,
      netItemsCount: 0,
      refunds: { totalRefunded: 0, itemsCount: 0, count: 0 },
    });
  });
});

describe('buildPaymentMethods', () => {
  it('reparte efectivo y tarjeta con su porcentaje', () => {
    const result = buildPaymentMethods([
      { method: PaymentMethod.EFECTIVO, amount: '75.10' },
      { method: PaymentMethod.TARJETA, amount: '24.90' },
    ]);

    expect(result).toEqual({
      total: 100,
      cash: { amount: 75.1, percentage: 75 },
      card: { amount: 24.9, percentage: 25 },
    });
  });

  it('suma varias filas del mismo método sin arrastrar error de coma flotante', () => {
    const result = buildPaymentMethods([
      { method: PaymentMethod.EFECTIVO, amount: '0.10' },
      { method: PaymentMethod.EFECTIVO, amount: '0.20' },
    ]);

    expect(result.cash.amount).toBe(0.3);
  });

  it('sin pagos los porcentajes son 0', () => {
    expect(buildPaymentMethods([]).cash.percentage).toBe(0);
  });
});

describe('buildWeekSummary', () => {
  it('rellena con ceros los días sin ventas y calcula la variación', () => {
    const week = buildWeekSummary(
      [
        { dayOfWeek: '1', total: '100' },
        { dayOfWeek: '3', total: '50' },
      ],
      '100',
    );

    expect(week.dailyBreakdown.map((day) => day.total)).toEqual([100, 0, 50, 0, 0, 0, 0]);
    expect(week.dailyBreakdown[0]).toEqual({ dayKey: '1', label: 'Lun', total: 100 });
    expect(week.totalWeek).toBe(150);
    expect(week.changePercentage).toBe(50);
  });

  it('sin semana anterior: 100% si hubo ventas y 0% si no', () => {
    expect(buildWeekSummary([{ dayOfWeek: '2', total: '10' }], '0').changePercentage).toBe(100);
    expect(buildWeekSummary([], '0').changePercentage).toBe(0);
  });

  it('una caída se expresa en negativo', () => {
    expect(buildWeekSummary([{ dayOfWeek: '1', total: '50' }], '200').changePercentage).toBe(-75);
  });
});

describe('buildTopProducts', () => {
  const row = { variantId: 'v1', productName: 'Café', sku: 'CAF', quantitySold: '12' };

  it('completa las claves relativas con la URL pública y respeta las absolutas', () => {
    const [relative, absolute, none] = buildTopProducts(
      [
        { ...row, imageUrl: 'tenant/a.jpg' },
        { ...row, imageUrl: 'https://cdn.example.com/b.jpg' },
        { ...row, imageUrl: null },
      ],
      'https://files.example.com',
    );

    expect(relative.imageUrl).toBe('https://files.example.com/tenant/a.jpg');
    expect(absolute.imageUrl).toBe('https://cdn.example.com/b.jpg');
    expect(none.imageUrl).toBeNull();
    expect(relative.quantitySold).toBe(12);
  });
});
