import { applyStockEntry, costFromRemainingLayers, FifoBatch, planFifoConsumption, weightedAverageCost } from './stock-rules';

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

describe('costFromRemainingLayers', () => {
  it('con un solo lote restante el costo es el de ese lote', () => {
    expect(costFromRemainingLayers({ layers: [{ remainingQuantity: 10, unitCost: 4 }], stockAfter: 10, currentCost: 5 })).toBe(4);
  });

  it('promedia varios lotes por sus unidades restantes', () => {
    const layers = [
      { remainingQuantity: 10, unitCost: 4 },
      { remainingQuantity: 30, unitCost: 8 },
    ];
    expect(costFromRemainingLayers({ layers, stockAfter: 40, currentCost: 99 })).toBe(7);
  });

  it('las ventas posteriores no distorsionan: solo cuentan las unidades que quedan de cada lote', () => {
    // De un lote de 10 a 4 se vendieron 3: quedan 7 a 4
    expect(costFromRemainingLayers({ layers: [{ remainingQuantity: 7, unitCost: 4 }], stockAfter: 7, currentCost: 5 })).toBe(4);
  });

  it('las unidades en stock sin lote se valoran al costo vigente', () => {
    // 6 unidades en lotes a 4 y 4 unidades antiguas sin lote al costo vigente de 9: (24 + 36) / 10
    expect(costFromRemainingLayers({ layers: [{ remainingQuantity: 6, unitCost: 4 }], stockAfter: 10, currentCost: 9 })).toBe(6);
  });

  it('sin existencias conserva el costo vigente', () => {
    expect(costFromRemainingLayers({ layers: [], stockAfter: 0, currentCost: 5.5 })).toBe(5.5);
    expect(costFromRemainingLayers({ layers: [], stockAfter: -3, currentCost: 5.5 })).toBe(5.5);
  });

  it('redondea el promedio a centavos', () => {
    const layers = [
      { remainingQuantity: 1, unitCost: 1 },
      { remainingQuantity: 2, unitCost: 2 },
    ];
    expect(costFromRemainingLayers({ layers, stockAfter: 3, currentCost: 0 })).toBe(1.67);
  });
});
