import { repeatedSkus } from './repeated-skus';

describe('repeatedSkus', () => {
  it('devuelve cada SKU repetido una sola vez, aunque aparezca tres veces', () => {
    expect(repeatedSkus(['A', 'B', 'A', 'C', 'A', 'B'])).toEqual(['A', 'B']);
  });

  it('ignora los espacios en los extremos', () => {
    expect(repeatedSkus(['A', ' A '])).toEqual(['A']);
  });

  it('distingue mayúsculas, como el índice único de la base de datos', () => {
    expect(repeatedSkus(['abc', 'ABC'])).toEqual([]);
  });

  it('sin repetidos devuelve una lista vacía', () => {
    expect(repeatedSkus(['A', 'B'])).toEqual([]);
    expect(repeatedSkus([])).toEqual([]);
  });
});
