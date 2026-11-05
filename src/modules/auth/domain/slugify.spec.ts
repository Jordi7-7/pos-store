import { slugify } from './slugify';

describe('slugify', () => {
  it('quita acentos, pasa a minúsculas y une con guiones', () => {
    expect(slugify('  Ferretería El Ñandú  ')).toBe('ferreteria-el-nandu');
  });

  it('colapsa símbolos y no deja guiones en los extremos', () => {
    expect(slugify('--Tienda & Co.--')).toBe('tienda-co');
  });

  it('devuelve vacío si no queda ningún carácter válido', () => {
    expect(slugify('¡¡¡')).toBe('');
  });
});
