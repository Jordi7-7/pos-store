import { normalizeSku } from './sku';

describe('normalizeSku', () => {
  it('recorta los espacios y pasa a mayúsculas', () => {
    expect(normalizeSku('  cam-roja ')).toBe('CAM-ROJA');
    expect(normalizeSku('Cam-1')).toBe('CAM-1');
  });

  it('es idempotente y conserva guiones, puntos y números', () => {
    expect(normalizeSku(normalizeSku('a.b_c-9'))).toBe('A.B_C-9');
  });

  it('conserva los caracteres acentuados en mayúscula', () => {
    expect(normalizeSku('ñandú-1')).toBe('ÑANDÚ-1');
  });
});
