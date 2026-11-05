import { applyStockEntry, FifoBatch, planFifoConsumption, weightedAverageCost } from './stock-rules';

const batch = (remainingQuantity: number, unitCost: number): FifoBatch => ({ remainingQuantity, unitCost });

describe('planFifoConsumption', () => {
  it('consume el lote más antiguo primero', () => {
    const oldest = batch(5, 2);
    const newest = batch(5, 4);

    const plan = planFifoConsumption([oldest, newest], 3, 9);

    expect(plan.consumptions).toEqual([{ batch: oldest, quantity: 3, remainingAfter: 2 }]);
    expect(plan.averageUnitCost).toBe(2);
  });

  it('cruza lotes y promedia su costo', () => {
    const plan = planFifoConsumption([batch(1, 2), batch(5, 4)], 2, 9);

    expect(plan.consumptions.map((c) => c.quantity)).toEqual([1, 1]);
    expect(plan.averageUnitCost).toBe(3);
  });

  it('valora a costo de ficha lo que los lotes no cubren', () => {
    expect(planFifoConsumption([batch(1, 2)], 2, 6).averageUnitCost).toBe(4);
    expect(planFifoConsumption([], 2, 6).averageUnitCost).toBe(6);
  });

  it('deja el lote en 0 sin error de coma flotante', () => {
    const plan = planFifoConsumption([batch(0.3, 1)], 0.3, 1);

    expect(plan.consumptions[0].remainingAfter).toBe(0);
  });

  it('ignora lotes agotados', () => {
    expect(planFifoConsumption([batch(0, 2), batch(1, 4)], 1, 9).consumptions).toHaveLength(1);
  });

  it('no modifica los lotes recibidos', () => {
    const untouched = batch(5, 2);

    planFifoConsumption([untouched], 3, 9);

    expect(untouched.remainingQuantity).toBe(5);
  });
});

describe('applyStockEntry', () => {
  it('con stock positivo, todo el lote queda disponible', () => {
    expect(applyStockEntry(5, 3)).toEqual({ newStock: 8, batchRemainingQuantity: 3 });
  });

  it('salda primero la deuda de stock negativo', () => {
    expect(applyStockEntry(-2, 5)).toEqual({ newStock: 3, batchRemainingQuantity: 3 });
  });

  it('si la deuda supera la entrada, el lote nace agotado', () => {
    expect(applyStockEntry(-5, 2)).toEqual({ newStock: -3, batchRemainingQuantity: 0 });
  });

  it('suma cantidades fraccionarias con exactitud', () => {
    expect(applyStockEntry(0.1, 0.7).newStock).toBe(0.8);
  });
});

describe('weightedAverageCost', () => {
  it('pondera el costo actual y el de la entrada', () => {
    expect(weightedAverageCost({ currentStock: 10, currentCost: 4, incomingQuantity: 10, incomingCost: 6 })).toBe(5);
  });

  it('sin stock previo usa el costo de la entrada', () => {
    expect(weightedAverageCost({ currentStock: 0, currentCost: 4, incomingQuantity: 5, incomingCost: 6 })).toBe(6);
  });

  it('el stock negativo cuenta como 0', () => {
    expect(weightedAverageCost({ currentStock: -3, currentCost: 4, incomingQuantity: 5, incomingCost: 6 })).toBe(6);
  });

  it('no divide por cero', () => {
    expect(weightedAverageCost({ currentStock: 0, currentCost: 4, incomingQuantity: 0, incomingCost: 6 })).toBe(6);
  });

  it('redondea a céntimos', () => {
    expect(weightedAverageCost({ currentStock: 1, currentCost: 1, incomingQuantity: 2, incomingCost: 2 })).toBe(1.67);
  });
});
