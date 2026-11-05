import { repeatedSkus } from './repeated-skus';

describe('repeatedSkus', () => {
  it('devuelve cada SKU repetido una sola vez, aunque aparezca tres veces', () => {
    expect(repeatedSkus(['A', 'B', 'A', 'C', 'A', 'B'])).toEqual(['A', 'B']);
  });

  it('ignora los espacios en los extremos', () => {
    expect(repeatedSkus(['A', ' A '])).toEqual(['A']);
  });

  it('no distingue mayúsculas: "abc" y "ABC" son el mismo SKU y se informa normalizado', () => {
    expect(repeatedSkus(['abc', 'ABC'])).toEqual(['ABC']);
  });

  it('sin repetidos devuelve una lista vacía', () => {
    expect(repeatedSkus(['A', 'B'])).toEqual([]);
    expect(repeatedSkus([])).toEqual([]);
  });
});
