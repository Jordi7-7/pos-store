import { MAX_PAGE_SIZE, parseLimit, parsePage } from './pagination';

describe('paginación', () => {
  it('parsePage cae en la primera página con valores ausentes o inválidos', () => {
    expect([parsePage(undefined), parsePage('abc'), parsePage(0), parsePage(-3), parsePage(1.5)]).toEqual([1, 1, 1, 1, 1]);
    expect([parsePage('3'), parsePage(2)]).toEqual([3, 2]);
  });

  it('parseLimit usa el valor por defecto con entradas inválidas', () => {
    expect([parseLimit(undefined), parseLimit('x'), parseLimit(0), parseLimit(-1)]).toEqual([10, 10, 10, 10]);
    expect(parseLimit(undefined, 25)).toBe(25);
  });

  it('parseLimit respeta el valor pedido y lo acota al máximo', () => {
    expect(parseLimit('20')).toBe(20);
    expect(parseLimit(5000)).toBe(MAX_PAGE_SIZE);
  });
});
