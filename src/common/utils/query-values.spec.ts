import { blankToUndefined } from './query-values';

describe('blankToUndefined', () => {
  it.each(['', '  ', 'null', 'undefined'])('trata %p como ausente', (value) => {
    expect(blankToUndefined(value)).toBeUndefined();
  });

  it('conserva un valor real recortado y lo que no es texto', () => {
    expect(blankToUndefined(' abc ')).toBe('abc');
    expect(blankToUndefined(5)).toBe(5);
    expect(blankToUndefined(undefined)).toBeUndefined();
  });
});
