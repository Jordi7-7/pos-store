import { EntityManager } from 'typeorm';
import { HashService } from '../../auth/services/hash.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { isPinInUse } from './pin-uniqueness';
import { UserRules, replaceUserBranches } from './user-rules';

jest.mock('./pin-uniqueness', () => ({ isPinInUse: jest.fn() }));

describe('UserRules', () => {
  const findOne = jest.fn();
  const query = jest.fn();
  const manager = { getRepository: () => ({ findOne }), query } as unknown as EntityManager;
  const hash = jest.fn();
  const rules = new UserRules(manager, { hash } as unknown as HashService, 't1');
  const pinInUse = isPinInUse as jest.MockedFunction<typeof isPinInUse>;

  beforeEach(() => jest.resetAllMocks());

  describe('assertUsernameAvailable', () => {
    it('acepta un nombre libre y busca solo dentro del tenant', async () => {
      findOne.mockResolvedValue(null);
      await expect(rules.assertUsernameAvailable('ana')).resolves.toBeUndefined();
      expect(findOne).toHaveBeenCalledWith({ where: { tenantId: 't1', username: 'ana' } });
    });

    it('rechaza uno ocupado con USERNAME_TAKEN y el nombre en details', async () => {
      findOne.mockResolvedValue({ id: 'otro' });
      await expect(rules.assertUsernameAvailable('ana')).rejects.toMatchObject({ code: ErrorCode.UsernameTaken, details: { username: 'ana' } });
    });

    it('al editar excluye al propio usuario de la búsqueda', async () => {
      findOne.mockResolvedValue(null);
      await rules.assertUsernameAvailable('ana', 'u1');
      const where = (findOne.mock.calls[0][0] as { where: { id: unknown } }).where;
      expect(where.id).toBeDefined();
    });
  });

  describe('assertEmailAvailable', () => {
    it('sin correo no consulta la base de datos', async () => {
      await rules.assertEmailAvailable(null);
      expect(findOne).not.toHaveBeenCalled();
    });

    it('rechaza un correo ocupado con EMAIL_TAKEN', async () => {
      findOne.mockResolvedValue({ id: 'otro' });
      await expect(rules.assertEmailAvailable('a@b.com')).rejects.toMatchObject({ code: ErrorCode.EmailTaken });
    });
  });

  describe('roles', () => {
    it('requireRoleId devuelve el id si el rol es de la tienda', async () => {
      query.mockResolvedValue([{ id: 'r1' }]);
      await expect(rules.requireRoleId('r1')).resolves.toBe('r1');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('"tenant_id" = $2'), ['r1', 't1']);
    });

    it('requireRoleId responde ROLE_NOT_FOUND si no existe en la tienda', async () => {
      query.mockResolvedValue([]);
      await expect(rules.requireRoleId('r1')).rejects.toMatchObject({ code: ErrorCode.RoleNotFound });
    });

    it('defaultRoleId devuelve el rol Cajero o null', async () => {
      query.mockResolvedValueOnce([{ id: 'cajero' }]).mockResolvedValueOnce([]);
      await expect(rules.defaultRoleId()).resolves.toBe('cajero');
      await expect(rules.defaultRoleId()).resolves.toBeNull();
    });
  });

  describe('hashAvailablePin', () => {
    it.each([undefined, '', '   '])('un PIN vacío (%j) significa sin PIN y no consulta nada', async (raw) => {
      await expect(rules.hashAvailablePin(raw)).resolves.toBeUndefined();
      expect(pinInUse).not.toHaveBeenCalled();
    });

    it('devuelve el hash de un PIN libre, recortado', async () => {
      pinInUse.mockResolvedValue(false);
      hash.mockResolvedValue('hashed');
      await expect(rules.hashAvailablePin(' 123456 ', 'u1')).resolves.toBe('hashed');
      expect(pinInUse).toHaveBeenCalledWith(manager, expect.anything(), 't1', '123456', 'u1');
      expect(hash).toHaveBeenCalledWith('123456');
    });

    it('rechaza un PIN usado por otro con PIN_ALREADY_IN_USE y no lo hashea', async () => {
      pinInUse.mockResolvedValue(true);
      await expect(rules.hashAvailablePin('123456')).rejects.toMatchObject({ code: ErrorCode.PinAlreadyInUse });
      expect(hash).not.toHaveBeenCalled();
    });
  });
});

describe('replaceUserBranches', () => {
  const query = jest.fn();
  const manager = { query } as unknown as EntityManager;

  beforeEach(() => jest.resetAllMocks());

  it('borra y vuelve a asignar con un único INSERT', async () => {
    await replaceUserBranches(manager, 'u1', ['b1', 'b2']);
    const sql = query.mock.calls.map(([statement]) => String(statement));
    expect(sql).toHaveLength(2);
    expect(sql[0]).toContain('DELETE FROM "user_branches"');
    expect(sql[1]).toContain('INSERT INTO "user_branches"');
  });

  it('sin sucursales solo borra', async () => {
    await replaceUserBranches(manager, 'u1', []);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
