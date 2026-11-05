import { ErrorCode } from '../../../common/errors/error-codes';
import { normalizeEmail, normalizeUsername } from './user-fields';

describe('normalizeUsername', () => {
  it('pasa a minúsculas y recorta los espacios', () => {
    expect(normalizeUsername('  Ana.Perez ')).toBe('ana.perez');
  });

  it.each(['', '   '])('rechaza un valor vacío (%j) con USERNAME_REQUIRED', (raw) => {
    expect(() => normalizeUsername(raw)).toThrow(expect.objectContaining({ code: ErrorCode.UsernameRequired }));
  });
});

describe('normalizeEmail', () => {
  it('pasa a minúsculas y recorta', () => {
    expect(normalizeEmail('  Ana@Tienda.COM ')).toBe('ana@tienda.com');
  });

  it.each([undefined, null, '', '   '])('un valor ausente o vacío (%j) es null', (raw) => {
    expect(normalizeEmail(raw)).toBeNull();
  });
});
