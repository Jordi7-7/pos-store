import { resolveEffectivePermissions } from './effective-permissions';

describe('resolveEffectivePermissions', () => {
  it("el propietario siempre tiene '*', aunque tenga rol o permisos propios", () => {
    expect(resolveEffectivePermissions({ isOwner: true, roleEntity: { permissions: ['a'] }, customPermissions: ['b'] })).toEqual(['*']);
  });

  it('une rol y permisos personalizados sin duplicados', () => {
    expect(resolveEffectivePermissions({ isOwner: false, roleEntity: { permissions: ['a', 'b'] }, customPermissions: ['b', 'c'] })).toEqual(['a', 'b', 'c']);
  });

  it('sin rol ni permisos no tiene ninguno', () => {
    expect(resolveEffectivePermissions({ isOwner: false, roleEntity: null, customPermissions: null })).toEqual([]);
  });
});
