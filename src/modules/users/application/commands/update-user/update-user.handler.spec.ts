import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { APP_PERMISSIONS } from '../../../../../common/enums/permissions.enum';
import { HashService } from '../../../../auth/services/hash.service';
import { AuthTokenService } from '../../../../auth/services/auth-token.service';
import { User } from '../../../domain/entities/user.entity';
import { UpdateUserCommand } from './update-user.command';
import { UpdateUserDto } from '../../../infrastructure/dtos/update-user.dto';
import { UpdateUserHandler } from './update-user.handler';

describe('UpdateUserHandler', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const query = jest.fn();

  const entityManager: EntityManager = {
    getRepository: () => ({ findOne, save }),
    query,
    transaction: <T>(work: (manager: EntityManager) => Promise<T>) => work(entityManager),
  } as unknown as EntityManager;
  const hash = jest.fn();
  const hashService = { hash } as unknown as HashService;
  const del = jest.fn();
  const redisService = { del } as unknown as RedisService;
  const revokeSession = jest.fn();
  const tokens = { revokeSession } as unknown as AuthTokenService;
  const handler = new UpdateUserHandler(entityManager, hashService, redisService, tokens);

  const run = (userId: string, dto: UpdateUserDto, currentUserId?: string) =>
    handler.execute(new UpdateUserCommand('t1', userId, dto, currentUserId));

  beforeEach(() => {
    jest.resetAllMocks();
    save.mockImplementation((u: User) => Promise.resolve(u));
  });

  it('impide que otro usuario modifique la cuenta del propietario', async () => {
    findOne.mockResolvedValue({
      id: 'owner',
      isOwner: true,
      tenantId: 't1',
    });

    await expect(run('owner', { name: 'Hacked' }, 'manager')).rejects.toMatchObject({ code: ErrorCode.OwnerOnlyEditsSelf });
    expect(save).not.toHaveBeenCalled();
  });

  it('el propietario sí puede editar su propia cuenta', async () => {
    findOne.mockResolvedValue({
      id: 'owner',
      isOwner: true,
      tenantId: 't1',
      name: 'Old',
    });

    const result = await run('owner', { name: 'New' }, 'owner');

    expect(result.name).toBe('New');
  });

  it("rechaza customPermissions con el comodín '*'", async () => {
    findOne.mockResolvedValue({
      id: 'u2',
      isOwner: false,
      tenantId: 't1',
    });

    await expect(
      run('u2', { customPermissions: ['*'] }, 'manager'),
    ).rejects.toMatchObject({ code: ErrorCode.InvalidPermissions });
    expect(save).not.toHaveBeenCalled();
  });

  it('guarda customPermissions válidos', async () => {
    findOne.mockResolvedValue({
      id: 'u2',
      isOwner: false,
      tenantId: 't1',
    });

    const result = await run(
      'u2',
      { customPermissions: [APP_PERMISSIONS.VIEW_POS] },
      'manager',
    );

    expect(result.customPermissions).toEqual([APP_PERMISSIONS.VIEW_POS]);
  });

  it('no permite que un usuario se desactive a sí mismo', async () => {
    findOne.mockResolvedValue({
      id: 'u2',
      isOwner: false,
      tenantId: 't1',
    });

    await expect(run('u2', { isActive: false }, 'u2')).rejects.toMatchObject({ code: ErrorCode.CannotDeactivateSelf });
  });

  it('rechaza branchIds de otro tenant antes de guardar nada', async () => {
    findOne.mockResolvedValue({ id: 'u2', isOwner: false, tenantId: 't1' } as User);
    query.mockResolvedValue([]); // ninguna de las sucursales pertenece al tenant

    await expect(run('u2', { branchIds: ['sucursal-ajena'] }, 'manager')).rejects.toMatchObject({
      code: ErrorCode.InvalidReference,
    });
    expect(save).not.toHaveBeenCalled();
  });

  describe('sucursales', () => {
    const user = () => ({ id: 'u2', isOwner: false, isActive: true, tenantId: 't1' }) as User;
    const BRANCH_A = '11111111-1111-4111-8111-111111111111';
    const BRANCH_B = '22222222-2222-4222-8222-222222222222';

    it('reemplaza las sucursales con un solo INSERT y refresca el caché después de guardar', async () => {
      findOne.mockResolvedValue(user());
      query.mockImplementation((sql: string) =>
        Promise.resolve(sql.includes('FROM "branches"') ? [{ id: BRANCH_A }, { id: BRANCH_B }] : []),
      );

      await run('u2', { branchIds: [BRANCH_A, BRANCH_B] }, 'manager');

      const writes = query.mock.calls.map(([sql]) => String(sql));
      expect(writes.filter((sql) => sql.includes('INSERT INTO "user_branches"'))).toHaveLength(1);
      expect(writes.some((sql) => sql.includes('DELETE FROM "user_branches"'))).toBe(true);
      expect(del).toHaveBeenCalledWith('user_branches:u2');
    });

    it('sin ninguna sucursal el usuario queda desactivado en un único guardado', async () => {
      findOne.mockResolvedValue(user());
      query.mockResolvedValue([]);

      const result = await run('u2', { branchIds: [] }, 'manager');

      expect(result.isActive).toBe(false);
      expect(save).toHaveBeenCalledTimes(1);
      expect(revokeSession).toHaveBeenCalledWith('u2');
    });

    it('si falla al reasignar las sucursales no refresca el caché ni revoca sesiones (la transacción se revierte)', async () => {
      findOne.mockResolvedValue(user());
      query.mockImplementation((sql: string) => {
        if (sql.includes('FROM "branches"')) return Promise.resolve([{ id: BRANCH_A }]);
        if (sql.includes('INSERT INTO "user_branches"')) return Promise.reject(new Error('fallo de base de datos'));
        return Promise.resolve([]);
      });

      await expect(run('u2', { branchIds: [BRANCH_A], password: 'nueva-clave' }, 'manager')).rejects.toThrow('fallo de base de datos');
      expect(del).not.toHaveBeenCalled();
      expect(revokeSession).not.toHaveBeenCalled();
    });
  });

  describe('sesiones abiertas', () => {
    const active = () => ({ id: 'u2', isOwner: false, isActive: true, tenantId: 't1' }) as User;

    it('cambiar la contraseña revoca la sesión del usuario', async () => {
      findOne.mockResolvedValue(active());
      hash.mockResolvedValue('hash');

      await run('u2', { password: 'nueva-clave' }, 'manager');

      expect(revokeSession).toHaveBeenCalledWith('u2');
    });

    it('desactivar a un usuario activo revoca su sesión', async () => {
      findOne.mockResolvedValue(active());

      await run('u2', { isActive: false }, 'manager');

      expect(revokeSession).toHaveBeenCalledWith('u2');
    });

    it('editar el nombre no toca las sesiones', async () => {
      findOne.mockResolvedValue(active());

      await run('u2', { name: 'Nuevo' }, 'manager');

      expect(revokeSession).not.toHaveBeenCalled();
    });

    it('reactivar a un usuario que ya estaba inactivo no revoca nada', async () => {
      findOne.mockResolvedValue({ ...active(), isActive: false });

      await run('u2', { isActive: true }, 'manager');

      expect(revokeSession).not.toHaveBeenCalled();
    });
  });
});
