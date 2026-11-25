import { ImportRow, planImport } from './import-plan';

const row = (overrides: Partial<ImportRow> & { row: number }): ImportRow => ({
  name: 'Playera',
  baseSku: 'PLY',
  category: 'Ropa',
  attributes: [{ name: 'Talla', value: 'M' }],
  sku: `PLY-${overrides.row}`,
  barcode: '',
  purchasePrice: 5,
  salePrice: 12,
  wholesalePrice: null,
  quantity: 3,
  ...overrides,
});

describe('planImport', () => {
  it('agrupa las filas con el mismo SKU base en un producto con variantes', () => {
    const plan = planImport([
      row({ row: 2, attributes: [{ name: 'Talla', value: 'M' }, { name: 'Color', value: 'Negro' }], sku: 'ply-m-neg' }),
      row({ row: 3, attributes: [{ name: 'Talla', value: 'L' }, { name: 'Color', value: 'Negro' }], sku: 'PLY-L-NEG' }),
    ]);

    expect(plan.errors).toEqual([]);
    expect(plan.products).toHaveLength(1);
    expect(plan.products[0]).toMatchObject({ kind: 'VARIABLE', name: 'Playera', baseSku: 'PLY', category: 'Ropa' });
    expect(plan.products[0]?.variants.map((variant) => variant.sku)).toEqual(['PLY-M-NEG', 'PLY-L-NEG']);
  });

  it('una fila sin atributos ni SKU base es un producto simple con su SKU como base', () => {
    const plan = planImport([row({ row: 2, baseSku: '', attributes: [], sku: 'tornillo-1', name: 'Tornillo', category: '' })]);

    expect(plan.errors).toEqual([]);
    expect(plan.products).toEqual([expect.objectContaining({ kind: 'SIMPLE', baseSku: 'TORNILLO-1', category: null })]);
  });

  it('los campos obligatorios se señalan por fila, todos a la vez', () => {
    const plan = planImport([row({ row: 2, name: ' ', sku: '', salePrice: null, quantity: -1, purchasePrice: -2 })]);

    expect(plan.errors.map((error) => [error.row, error.field]).sort()).toEqual([[2, 'name'], [2, 'purchasePrice'], [2, 'quantity'], [2, 'salePrice'], [2, 'sku']]);
  });

  it('un SKU repetido en el archivo nombra la fila donde aparece primero', () => {
    const plan = planImport([row({ row: 2, sku: 'A-1' }), row({ row: 3, sku: 'a-1', attributes: [{ name: 'Talla', value: 'L' }] })]);

    expect(plan.errors).toEqual([{ row: 3, field: 'sku', message: 'El SKU A-1 ya aparece en la fila 2.' }]);
  });

  it('variantes con el mismo SKU base deben coincidir en nombre y categoría', () => {
    const plan = planImport([row({ row: 2 }), row({ row: 3, name: 'Otra cosa', category: 'Calzado', attributes: [{ name: 'Talla', value: 'L' }] })]);

    expect(plan.errors.map((error) => [error.row, error.field])).toEqual([[3, 'name'], [3, 'category']]);
  });

  it('todas las variantes usan los mismos atributos y ninguna repite combinación', () => {
    const plan = planImport([
      row({ row: 2 }),
      row({ row: 3, attributes: [{ name: 'Color', value: 'Rojo' }] }),
      row({ row: 4, attributes: [{ name: 'talla', value: 'm' }] }),
      row({ row: 5, attributes: [] }),
    ]);

    expect(plan.errors.map((error) => [error.row, error.field])).toEqual([[3, 'attributes'], [4, 'attributes'], [5, 'attributes']]);
    expect(plan.errors[1]?.message).toContain('fila 2');
  });

  it('varias filas sin atributos con el mismo SKU base no son variantes', () => {
    const plan = planImport([row({ row: 2, attributes: [] }), row({ row: 3, attributes: [] })]);

    expect(plan.errors).toEqual([expect.objectContaining({ row: 3, field: 'baseSku' })]);
  });

  it('una variante sin SKU base se señala; un atributo a medias también', () => {
    const plan = planImport([row({ row: 2, baseSku: '' }), row({ row: 3, sku: 'X-3', attributes: [{ name: 'Talla', value: '' }] })]);

    expect(plan.errors).toEqual([expect.objectContaining({ row: 2, field: 'baseSku' }), expect.objectContaining({ row: 3, field: 'attributes' })]);
  });

  it('el SKU de una variante no puede ser el SKU base de otro producto del archivo', () => {
    const plan = planImport([
      row({ row: 2, baseSku: 'AAA', sku: 'AAA-1' }),
      row({ row: 3, baseSku: 'BBB', sku: 'AAA', name: 'Otro' }),
    ]);

    expect(plan.errors).toEqual([expect.objectContaining({ row: 3, field: 'sku' })]);
  });
});
