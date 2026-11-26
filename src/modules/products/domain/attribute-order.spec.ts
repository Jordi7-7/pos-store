import { findOrderProblem } from './attribute-order';

describe('orden de las opciones de un atributo', () => {
  it('acepta la misma lista en otro orden', () => {
    expect(findOrderProblem(['a', 'b', 'c'], ['c', 'a', 'b'])).toBeNull();
  });
  it('rechaza una opción repetida, una ajena y una que falta', () => {
    expect(findOrderProblem(['a', 'b'], ['a', 'a'])).toBe('DUPLICATED');
    expect(findOrderProblem(['a', 'b'], ['a', 'b', 'x'])).toBe('UNKNOWN');
    expect(findOrderProblem(['a', 'b', 'c'], ['a', 'b'])).toBe('MISSING');
  });
  it('una lista vacía solo vale para un atributo sin opciones', () => {
    expect(findOrderProblem([], [])).toBeNull();
    expect(findOrderProblem(['a'], [])).toBe('MISSING');
  });
});
