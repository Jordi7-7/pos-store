import { DomainError } from '../../../../common/domain/domain.error';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { planRefund, RefundableLine } from './refund-plan';

const line = (overrides: Partial<RefundableLine> = {}): RefundableLine => ({
  variantId: 'v1',
  quantity: 3,
  price: 5,
  refundedQuantity: 0,
  discountAmount: 0,
  globalDiscountAmount: 0,
  total: 15,
  ...overrides,
});

describe('planRefund', () => {
  it('devuelve lo pagado por la línea, con descuentos ya aplicados', () => {
    const plan = planRefund([line({ total: 12 })], [{ variantId: 'v1', quantity: 3 }]);

    expect(plan.totalRefunded).toBe(12);
    expect(plan.allocations[0]).toMatchObject({ quantity: 3, amount: 12, unitPrice: 4 });
  });

  it('devolver toda la línea de una vez no pierde céntimos', () => {
    expect(planRefund([line({ total: 10 })], [{ variantId: 'v1', quantity: 3 }]).totalRefunded).toBe(10);
  });

  it('las devoluciones parciales suman exactamente lo pagado', () => {
    const refundOne = (refundedQuantity: number): number =>
      planRefund([line({ total: 10, refundedQuantity })], [{ variantId: 'v1', quantity: 1 }]).totalRefunded;

    expect([refundOne(0), refundOne(1), refundOne(2)]).toEqual([3.33, 3.34, 3.33]);
  });

  it('una línea regalada con descuento total no devuelve dinero', () => {
    const free = line({ total: 0, discountAmount: 15 });

    expect(planRefund([free], [{ variantId: 'v1', quantity: 3 }]).totalRefunded).toBe(0);
  });

  it('una venta antigua sin total guardado usa precio menos descuentos', () => {
    const legacy = line({ total: 0, discountAmount: 3 });

    expect(planRefund([legacy], [{ variantId: 'v1', quantity: 3 }]).totalRefunded).toBe(12);
  });

  it('con la variante en varias líneas, consume la siguiente al agotar la primera', () => {
    const first = line({ quantity: 1, price: 10, total: 10 });
    const second = line({ quantity: 2, price: 8, total: 16 });

    const plan = planRefund([first, second], [{ variantId: 'v1', quantity: 2 }]);

    expect(plan.allocations).toEqual([
      expect.objectContaining({ line: first, quantity: 1, amount: 10 }),
      expect.objectContaining({ line: second, quantity: 1, amount: 8 }),
    ]);
    expect(plan.totalRefunded).toBe(18);
  });

  it('salta las líneas ya devueltas', () => {
    const first = line({ quantity: 1, total: 10, refundedQuantity: 1 });
    const second = line({ quantity: 1, total: 8 });

    const plan = planRefund([first, second], [{ variantId: 'v1', quantity: 1 }]);

    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].line).toBe(second);
  });

  it('acumula peticiones repetidas de la misma variante', () => {
    const requests = [
      { variantId: 'v1', quantity: 2 },
      { variantId: 'v1', quantity: 2 },
    ];

    expect(() => planRefund([line()], requests)).toThrow(/Solo quedan 1 pieza/);
  });

  it('admite cantidades fraccionarias sin errores de coma flotante', () => {
    const fractional = line({ quantity: 0.3, price: 10, total: 3, refundedQuantity: 0.1 });

    expect(planRefund([fractional], [{ variantId: 'v1', quantity: 0.2 }]).totalRefunded).toBe(2);
  });

  it('no modifica las líneas recibidas', () => {
    const sold = line();

    planRefund([sold], [{ variantId: 'v1', quantity: 1 }]);

    expect(sold.refundedQuantity).toBe(0);
  });

  it.each([
    ['sin productos', []],
    ['cantidad cero', [{ variantId: 'v1', quantity: 0 }]],
    ['cantidad negativa', [{ variantId: 'v1', quantity: -1 }]],
    ['variante ajena a la venta', [{ variantId: 'otra', quantity: 1 }]],
    ['más de lo vendido', [{ variantId: 'v1', quantity: 4 }]],
  ])('rechaza %s', (_case, requests) => {
    const action = (): unknown => planRefund([line()], requests);

    expect(action).toThrow(DomainError);
    expect(action).toThrow(expect.objectContaining({ code: ErrorCode.InvalidRefund }));
  });

  it('rechaza devolver lo que ya se devolvió', () => {
    expect(() => planRefund([line({ refundedQuantity: 3 })], [{ variantId: 'v1', quantity: 1 }])).toThrow(/Solo quedan 0/);
  });
});
