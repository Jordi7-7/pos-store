import { hasFullAccess, meetsRequirement } from './permission-check';

describe('permission-check', () => {
  it('el propietario y el comodín dan acceso total', () => {
    expect(hasFullAccess({ isOwner: true, permissions: [] })).toBe(true);
    expect(hasFullAccess({ permissions: ['*'] })).toBe(true);
    expect(hasFullAccess({ permissions: ['a'] })).toBe(false);
    expect(hasFullAccess({})).toBe(false);
  });

  it('all exige todos los permisos', () => {
    expect(meetsRequirement({ permissions: ['a', 'b'] }, { all: ['a', 'b'] })).toBe(true);
    expect(meetsRequirement({ permissions: ['a'] }, { all: ['a', 'b'] })).toBe(false);
  });

  it('any exige al menos uno', () => {
    expect(meetsRequirement({ permissions: ['b'] }, { any: ['a', 'b'] })).toBe(true);
    expect(meetsRequirement({ permissions: ['c'] }, { any: ['a', 'b'] })).toBe(false);
  });

  it('con all y any a la vez se cumplen ambas', () => {
    expect(meetsRequirement({ permissions: ['a'] }, { all: ['a'], any: ['b'] })).toBe(false);
    expect(meetsRequirement({ permissions: ['a', 'b'] }, { all: ['a'], any: ['b'] })).toBe(true);
  });

  it('sin permisos en el token no se cumple ninguna regla exigida', () => {
    expect(meetsRequirement({ permissions: undefined }, { all: ['a'] })).toBe(false);
    expect(meetsRequirement({ permissions: null }, { any: ['a'] })).toBe(false);
  });
});
