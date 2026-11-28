import { buildSelectorAttributes, sortBySku, sortCombination, VariantOption } from './pos-variant-view';

const option = (id: string, attribute: string, value: string, sortOrder = 0, createdAt = '2026-01-01'): VariantOption => ({
  id,
  attributeId: attribute,
  value,
  sortOrder,
  createdAt: new Date(createdAt),
  attribute: { name: attribute },
});

describe('vista de variantes del POS', () => {
  it('ordena por SKU leyendo los números como números, sin tocar la lista original', () => {
    const variants = [{ sku: 'M-10' }, { sku: 'M-2' }, { sku: 'M-1' }];

    expect(sortBySku(variants).map((v) => v.sku)).toEqual(['M-1', 'M-2', 'M-10']);
    expect(variants[0].sku).toBe('M-10');
  });

  it('la combinación sale ordenada por el nombre del atributo', () => {
    expect(sortCombination([option('1', 'Copa', 'a'), option('2', 'Base', 'b')]).map((o) => o.attributeId)).toEqual(['Base', 'Copa']);
  });

  it('pone primero el atributo con más opciones y, a igualdad, por nombre', () => {
    const attributes = buildSelectorAttributes([
      [option('c1', 'Copa', 'Negro'), option('z1', 'Cierre', 'Negro'), option('b1', 'Base', 'Negro'), option('t1', 'Talla', 'S')],
      [option('c1', 'Copa', 'Negro'), option('z2', 'Cierre', 'Rojo'), option('b2', 'Base', 'Rojo'), option('t1', 'Talla', 'S')],
      [option('c1', 'Copa', 'Negro'), option('z1', 'Cierre', 'Negro'), option('b3', 'Base', 'Verde'), option('t2', 'Talla', 'M')],
    ]);

    expect(attributes.map((a) => a.name)).toEqual(['Base', 'Cierre', 'Talla', 'Copa']);
  });

  it('las opciones siguen su orden configurado y, a igualdad, el de creación; sin repetirlas', () => {
    const large = option('l', 'Talla', 'L', 3);
    const [talla] = buildSelectorAttributes([
      [large],
      [option('s', 'Talla', 'S', 1)],
      [option('n', 'Talla', 'Nueva', 2, '2026-02-01')],
      [option('m', 'Talla', 'M', 2)],
      [large],
    ]);

    expect(talla.values).toEqual([
      { id: 's', value: 'S' },
      { id: 'm', value: 'M' },
      { id: 'n', value: 'Nueva' },
      { id: 'l', value: 'L' },
    ]);
  });
});
