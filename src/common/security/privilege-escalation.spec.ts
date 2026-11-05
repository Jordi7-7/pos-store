import { assertCanGrant, missingPermissions } from './privilege-escalation';

describe('privilege-escalation', () => {
  it('el propietario (*) lo puede conceder todo', () => {
    expect(missingPermissions(['*'], ['action:users.edit', 'action:roles.edit'])).toEqual([]);
  });

  it('quien tiene todos los permisos pedidos puede concederlos', () => {
    expect(() => assertCanGrant(['a', 'b', 'c'], ['a', 'c'])).not.toThrow();
  });

  it('no se puede conceder lo que no se tiene: responde PERMISSION_ESCALATION con lo que falta', () => {
    expect(() => assertCanGrant(['a'], ['a', 'b', 'c'])).toThrow(expect.objectContaining({ code: 'PERMISSION_ESCALATION', details: { missing: ['b', 'c'] } }));
  });

  it('un actor sin permisos no puede conceder nada, pero sí no conceder nada', () => {
    expect(() => assertCanGrant([], ['a'])).toThrow();
    expect(() => assertCanGrant([], [])).not.toThrow();
  });
});
