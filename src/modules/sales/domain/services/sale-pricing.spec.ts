import { DomainError } from '../../../../common/domain/domain.error';
import { Money } from '../../../../common/domain/money';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { allocatePayments, assertPaymentsCoverTotal, priceSale, SaleLineAmounts } from './sale-pricing';

const line = (overrides: Partial<SaleLineAmounts> = {}): SaleLineAmounts => ({ quantity: 2, price: 10, ...overrides });

function errorOf(fn: () => void): DomainError {
  try {
    fn();
  } catch (error) {
    return error as DomainError;
  }
  throw new Error('Se esperaba que lanzara una excepción');
}

describe('priceSale', () => {
  describe('importes', () => {
    it('calcula una venta sin descuentos', () => {
      expect(priceSale([line(), line({ price: 3, quantity: 1 })])).toEqual({
        lines: [
          { subtotal: 20, discountAmount: 0, globalDiscountAmount: 0, total: 20 },
          { subtotal: 3, discountAmount: 0, globalDiscountAmount: 0, total: 3 },
        ],
        subtotal: 23,
        itemsDiscountAmount: 0,
        globalDiscountAmount: 0,
        discountAmount: 0,
        total: 23,
      });
    });

    it('aplica descuentos de línea y prorratea el global según la base neta', () => {
      const pricing = priceSale([line({ discountAmount: 5 }), line({ price: 2.5 })], 4);

      expect(pricing.lines).toEqual([
        { subtotal: 20, discountAmount: 5, globalDiscountAmount: 3, total: 12 },
        { subtotal: 5, discountAmount: 0, globalDiscountAmount: 1, total: 4 },
      ]);
      expect(pricing).toMatchObject({ subtotal: 25, itemsDiscountAmount: 5, globalDiscountAmount: 4, discountAmount: 9, total: 16 });
    });

    it('las líneas suman exactamente el total aunque el prorrateo no sea exacto', () => {
      const pricing = priceSale([line({ quantity: 1 }), line({ quantity: 1 }), line({ quantity: 1 })], 10);

      expect(pricing.total).toBe(20);
      expect(Money.sum(pricing.lines.map((l) => Money.of(l.total))).toNumber()).toBe(20);
      expect(Money.sum(pricing.lines.map((l) => Money.of(l.globalDiscountAmount))).toNumber()).toBe(10);
    });

    it('ninguna línea queda negativa con descuentos grandes sobre líneas baratas', () => {
      const pricing = priceSale([line({ price: 99.99, quantity: 1 }), line({ price: 0.01, quantity: 1 })], 99.99);

      expect(pricing.total).toBe(0.01);
      for (const priced of pricing.lines) {
        expect(priced.total).toBeGreaterThanOrEqual(0);
      }
    });

    it('un descuento igual al total deja la venta en 0 (venta gratis)', () => {
      expect(priceSale([line()], 20).total).toBe(0);
    });

    it('admite líneas gratis sin dividir por cero', () => {
      expect(priceSale([line({ price: 0 })]).total).toBe(0);
    });

    it('conserva el total del cliente con precios de más de 2 decimales', () => {
      expect(priceSale([line({ price: 3.333, quantity: 3 })]).total).toBe(10);
    });

    it('permite la misma variante en varias líneas con precio y descuento propios', () => {
      expect(priceSale([line({ price: 10 }), line({ price: 8, discountAmount: 2 })]).total).toBe(34);
    });

    it('tolera artefactos de coma flotante en importes legítimos', () => {
      // 0.1 + 0.2 = 0.30000000000000004
      expect(priceSale([line({ price: 0.1, quantity: 3, discountAmount: 0.30000000000000004 })]).total).toBe(0);
    });
  });

  describe('invariantes', () => {
    it('exige al menos un producto', () => {
      expect(errorOf(() => priceSale([])).code).toBe(ErrorCode.InvalidSaleAmounts);
    });

    it.each([0, -1, -0.5, Number.NaN])('rechaza cantidad %p', (quantity) => {
      expect(errorOf(() => priceSale([line({ quantity })])).code).toBe(ErrorCode.InvalidSaleAmounts);
    });

    it('rechaza precio negativo', () => {
      expect(() => priceSale([line({ price: -1 })])).toThrow(/precio/);
    });

    it('rechaza descuento de línea negativo o mayor a su importe', () => {
      expect(() => priceSale([line({ discountAmount: -1 })])).toThrow(/negativo/);
      expect(() => priceSale([line({ discountAmount: 20.01 })])).toThrow(/superar su importe/);
    });

    it('rechaza descuento global negativo o mayor al total', () => {
      expect(() => priceSale([line()], -1)).toThrow(/negativo/);
      expect(() => priceSale([line({ discountAmount: 5 })], 15.01)).toThrow(/superar el total/);
    });
  });
});

describe('assertPaymentsCoverTotal', () => {
  it('acepta el pago exacto, varios pagos y el exceso', () => {
    expect(() => assertPaymentsCoverTotal(10, [10])).not.toThrow();
    expect(() => assertPaymentsCoverTotal(0.3, [0.1, 0.2])).not.toThrow();
    expect(() => assertPaymentsCoverTotal(10, [20])).not.toThrow();
  });

  it('rechaza un pago insuficiente indicando importes', () => {
    const error = errorOf(() => assertPaymentsCoverTotal(10, [9.99]));

    expect(error.code).toBe(ErrorCode.InsufficientPayment);
    expect(error.message).toBe('El monto pagado ($9.99) es menor al total de la venta ($10.00).');
    expect(error.details).toEqual({ paid: 9.99, total: 10 });
  });
});

describe('allocatePayments', () => {
  const cash = (amount: number) => ({ paymentMethod: 'EFECTIVO', amount });
  const card = (amount: number) => ({ paymentMethod: 'TARJETA', amount });

  it('deja los pagos intactos cuando suman exactamente el total', () => {
    expect(allocatePayments(30, [cash(10), card(20)])).toEqual([cash(10), card(20)]);
  });

  it('el vuelto sale del efectivo: pagar 50 en efectivo una venta de 30 registra 30', () => {
    expect(allocatePayments(30, [cash(50)])).toEqual([cash(30)]);
  });

  it('con pago mixto la tarjeta se aplica completa y el efectivo absorbe el sobrante', () => {
    expect(allocatePayments(30, [cash(20), card(25)])).toEqual([cash(5), card(25)]);
  });

  it('una tarjeta que excede el total no genera vuelto: se recorta al total', () => {
    expect(allocatePayments(30, [card(40)])).toEqual([card(30)]);
  });

  it('descarta los pagos que quedan en cero y no pierde centavos', () => {
    expect(allocatePayments(0.3, [card(0.3), cash(10)])).toEqual([card(0.3)]);
    expect(allocatePayments(0.3, [cash(0.1), cash(0.2)])).toEqual([cash(0.1), cash(0.2)]);
  });
});
