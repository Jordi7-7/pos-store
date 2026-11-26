import { findVariantAttributeProblem } from './variant-attributes';

describe('findVariantAttributeProblem', () => {
  it('acepta variantes que usan los mismos atributos, en cualquier orden', () => {
    expect(findVariantAttributeProblem([['talla', 'color'], ['color', 'talla'], ['talla', 'color']])).toBeNull();
  });

  it('acepta variantes sin atributos (productos antiguos o simples) mientras ninguna los tenga', () => {
    expect(findVariantAttributeProblem([[], []])).toBeNull();
    expect(findVariantAttributeProblem([])).toBeNull();
  });

  it('rechaza una variante con dos valores del mismo atributo', () => {
    expect(findVariantAttributeProblem([['talla', 'talla']])).toBe('REPEATED');
  });

  it('rechaza mezclar atributos distintos entre variantes', () => {
    expect(findVariantAttributeProblem([['talla'], ['color']])).toBe('MIXED');
    expect(findVariantAttributeProblem([['talla', 'color'], ['talla']])).toBe('MIXED');
  });

  it('rechaza mezclar variantes con atributos y sin ellos', () => {
    expect(findVariantAttributeProblem([['talla'], []])).toBe('MIXED');
  });
});
