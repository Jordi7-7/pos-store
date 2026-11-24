import { duplicatedVariants, planStockCount } from './stock-count-rules';

const stock = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('planStockCount', () => {
  it('contar menos de lo que decía el sistema resta; contar más suma; contar igual no hace nada', () => {
    const plan = planStockCount(
      [
        { variantId: 'a', counted: 10, expected: 12 },
        { variantId: 'b', counted: 7, expected: 5 },
        { variantId: 'c', counted: 3, expected: 3 },
      ],
      stock({ a: 12, b: 5, c: 3 }),
    );

    expect(plan.adjustments).toEqual([
      { variantId: 'a', quantity: 2, type: 'OUT', unitCost: undefined },
      { variantId: 'b', quantity: 2, type: 'IN', unitCost: undefined },
    ]);
    expect(plan.changed).toEqual([]);
    expect(plan.negative).toEqual([]);
  });

  it('la diferencia se mide contra lo que el usuario veía, no contra el stock de ahora (no pisa lo vendido)', () => {
    // veía 12, contó 10, y mientras tanto se vendió 1: el stock actual es 11 → queda 9
    const plan = planStockCount([{ variantId: 'a', counted: 10, expected: 12 }], stock({ a: 11 }));

    expect(plan.adjustments).toEqual([{ variantId: 'a', quantity: 2, type: 'OUT', unitCost: undefined }]);
    expect(plan.changed).toEqual([{ variantId: 'a', expected: 12, current: 11 }]);
  });

  it('un stock negativo se corrige: veía −2, contó 3 → suma 5', () => {
    const plan = planStockCount([{ variantId: 'a', counted: 3, expected: -2 }], stock({ a: -2 }));

    expect(plan.adjustments).toEqual([{ variantId: 'a', quantity: 5, type: 'IN', unitCost: undefined }]);
    expect(plan.negative).toEqual([]);
  });

  it('detecta si restar la diferencia al stock actual lo dejaría en negativo', () => {
    // veía 5, contó 1 (−4), pero ya solo quedan 3
    const plan = planStockCount([{ variantId: 'a', counted: 1, expected: 5 }], stock({ a: 3 }));

    expect(plan.negative).toEqual([{ variantId: 'a', current: 3, difference: -4 }]);
  });

  it('una variante sin fila de stock cuenta como 0', () => {
    expect(planStockCount([{ variantId: 'a', counted: 4, expected: 0 }], stock({})).adjustments).toEqual([{ variantId: 'a', quantity: 4, type: 'IN', unitCost: undefined }]);
  });

  it('las cantidades decimales se restan con exactitud', () => {
    expect(planStockCount([{ variantId: 'a', counted: 0.3, expected: 0.1 }], stock({ a: 0.1 })).adjustments[0].quantity).toBe(0.2);
  });

  it('una línea sin diferencia no avisa de cambios aunque el stock se haya movido', () => {
    expect(planStockCount([{ variantId: 'a', counted: 5, expected: 5 }], stock({ a: 4 })).changed).toEqual([]);
  });

  it('conserva el costo escrito en las líneas que suman', () => {
    expect(planStockCount([{ variantId: 'a', counted: 2, expected: 0, unitCost: 3.5 }], stock({})).adjustments[0].unitCost).toBe(3.5);
  });
});

describe('duplicatedVariants', () => {
  it('devuelve las variantes repetidas una sola vez', () => {
    const line = (variantId: string) => ({ variantId, counted: 1, expected: 1 });

    expect(duplicatedVariants([line('a'), line('b'), line('a'), line('a')])).toEqual(['a']);
    expect(duplicatedVariants([line('a'), line('b')])).toEqual([]);
  });
});
