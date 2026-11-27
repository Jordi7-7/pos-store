import { ProductType } from './enums/product-type.enum';
import { createImageMatcher, fileStems, MatchProduct, MatchVariant } from './image-file-match';

const products: MatchProduct[] = [
  { id: 'ktm', name: 'Mochila KTM', type: ProductType.VARIABLE, baseSku: 'MOCH-KTM' },
  { id: 'llavero', name: 'Llavero Niño', type: ProductType.SIMPLE, baseSku: 'LLA' },
  { id: 'gorra1', name: 'Gorra', type: ProductType.SIMPLE, baseSku: 'GOR-1' },
  { id: 'gorra2', name: 'gorra', type: ProductType.SIMPLE, baseSku: 'GOR-2' },
];
const variants: MatchVariant[] = [
  { id: 'k1', productId: 'ktm', sku: 'MOCH-KTM-01', attributeValues: ['01'] },
  { id: 'k2', productId: 'ktm', sku: 'MOCH-KTM-02', attributeValues: ['02'] },
  { id: 'lv', productId: 'llavero', sku: 'LLA', attributeValues: [] },
];
const match = createImageMatcher(products, variants);
const found = (fileName: string) => {
  const result = match(fileName);
  return [result.status, ...result.candidates.map((target) => target.variantId ?? target.productId)];
};

describe('a qué pertenece una foto según su nombre', () => {
  it('por el SKU de la variante, sin importar mayúsculas ni la extensión', () => {
    expect(found('moch-ktm-02.JPG')).toEqual(['MATCHED', 'k2']);
  });

  it('un final _2 o (2) es otra foto de lo mismo', () => {
    expect(found('MOCH-KTM-01_2.jpg')).toEqual(['MATCHED', 'k1']);
    expect(found('Mochila KTM (3).jpeg')).toEqual(['MATCHED', 'ktm']);
  });

  it('por el SKU base o el nombre del producto, sin tildes ni signos', () => {
    expect(found('MOCH-KTM.jpg')).toEqual(['MATCHED', 'ktm']);
    expect(found('mochila_ktm.jpg')).toEqual(['MATCHED', 'ktm']);
    expect(found('LLAVERO-NINO.jpg')).toEqual(['MATCHED', 'llavero']);
  });

  it('por el nombre seguido de los valores de la variante', () => {
    expect(found('Mochila KTM 01.jpg')).toEqual(['MATCHED', 'k1']);
    expect(found('mochila-ktm-02_2.jpg')).toEqual(['MATCHED', 'k2']);
  });

  it('el SKU de un producto simple apunta al producto', () => {
    expect(match('LLA.jpg').candidates[0]).toMatchObject({ kind: 'PRODUCT', productId: 'llavero', variantId: null });
  });

  it('si dos productos se llaman igual hay que elegir', () => {
    expect(found('Gorra.jpg')).toEqual(['AMBIGUOUS', 'gorra1', 'gorra2']);
  });

  it('lo que no coincide queda sin destino: no se adivina por parecido', () => {
    expect(found('IMG_5341.jpg')).toEqual(['NOT_FOUND']);
    expect(found('Mochila KTM 09.jpg')).toEqual(['NOT_FOUND']);
    expect(found('Mochila.jpg')).toEqual(['NOT_FOUND']);
  });

  it('solo se prueba sin el número cuando el nombre completo no dice nada', () => {
    expect(fileStems('A_1.jpg')).toEqual(['A_1', 'A']);
    const own = createImageMatcher([...products, { id: 'a1', name: 'x', type: ProductType.SIMPLE, baseSku: 'LLA_2' }], variants);
    expect(own('LLA_2.jpg').candidates[0]).toMatchObject({ productId: 'a1' });
  });
});
