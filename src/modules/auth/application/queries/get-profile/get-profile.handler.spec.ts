import { ErrorCode } from '../../../../../common/errors/error-codes';
import { EntityManager } from 'typeorm';
import { User } from '../../../../users/domain/entities/user.entity';
import { GetProfileHandler } from './get-profile.handler';
import { GetProfileQuery } from './get-profile.query';

describe('GetProfileHandler', () => {
  const tenant = { id: 't1', name: 'Tienda', ruc: '1', slug: 'tienda', logoUrl: null, country: 'PY', timezone: 'UTC', currencyCode: 'PYG', currencySymbol: '₲' };
  const baseUser = { id: 'u1', name: 'Ana', username: 'ana', email: null, isOwner: false, tenant, branches: [], cashRegisters: [], customPermissions: ['x'], roleEntity: { id: 'r1', name: 'Cajero', permissions: ['a'] } };

  const handlerFor = (found: unknown) => {
    const findOne = jest.fn().mockResolvedValue(found);
    return { handler: new GetProfileHandler({ findOne } as unknown as EntityManager), findOne };
  };

  it('busca al usuario dentro de su tenant y une permisos de rol y personalizados', async () => {
    const { handler, findOne } = handlerFor(baseUser);

    const profile = await handler.execute(new GetProfileQuery('t1', 'u1'));

    expect(findOne).toHaveBeenCalledWith(User, expect.objectContaining({ where: { id: 'u1', tenantId: 't1' } }));
    expect(profile.permissions).toEqual(['a', 'x']);
    expect(profile.role).toEqual({ id: 'r1', name: 'Cajero' });
    expect(profile).not.toHaveProperty('password');
    expect(profile).not.toHaveProperty('pin');
  });

  it("el propietario recibe '*' y ningún rol", async () => {
    const { handler } = handlerFor({ ...baseUser, isOwner: true });
    const profile = await handler.execute(new GetProfileQuery('t1', 'u1'));
    expect(profile.permissions).toEqual(['*']);
    expect(profile.role).toBeNull();
  });

  it('rechaza si el usuario no existe en ese tenant', async () => {
    const { handler } = handlerFor(null);
    await expect(handler.execute(new GetProfileQuery('t1', 'u1'))).rejects.toMatchObject({ code: ErrorCode.UserNotFound });
  });
});
