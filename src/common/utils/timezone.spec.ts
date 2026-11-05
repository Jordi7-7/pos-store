import { DEFAULT_TIMEZONE, resolveTimezone } from './timezone';

describe('resolveTimezone', () => {
  it('acepta zonas IANA válidas', () => {
    expect(resolveTimezone('America/Lima')).toBe('America/Lima');
  });

  it('cae en la zona por defecto con valores vacíos o inexistentes', () => {
    expect([resolveTimezone(undefined), resolveTimezone(''), resolveTimezone('Marte/Olimpo')]).toEqual([
      DEFAULT_TIMEZONE,
      DEFAULT_TIMEZONE,
      DEFAULT_TIMEZONE,
    ]);
  });

  it('rechaza un texto con comillas, que nunca debe llegar a una consulta SQL', () => {
    expect(resolveTimezone("UTC' OR '1'='1")).toBe(DEFAULT_TIMEZONE);
  });
});
