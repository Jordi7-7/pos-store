import { EntityManager } from 'typeorm';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { AppException } from '../../../../common/errors/app.exception';
import { Role } from '../../domain/entities/role.entity';
import { CreateRoleCommand } from './create-role/create-role.command';
import { CreateRoleHandler } from './create-role/create-role.handler';
import { UpdateRoleCommand } from './update-role/update-role.command';
import { UpdateRoleHandler } from './update-role/update-role.handler';
import { DeleteRoleCommand } from './delete-role/delete-role.command';
import { DeleteRoleHandler } from './delete-role/delete-role.handler';

describe('Comandos de roles', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const remove = jest.fn();
  const count = jest.fn();
  const executeUpdate = jest.fn();
  const qb = { update: () => qb, set: () => qb, where: () => qb, execute: executeUpdate };
  const manager = {
    getRepository: () => ({ findOne, save, remove, count, createQueryBuilder: () => qb }),
    transaction: <T>(work: (m: EntityManager) => Promise<T>) => work(manager),
  } as unknown as EntityManager;

  const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
    try {
      await promise;
    } catch (error) {
      return error instanceof AppException ? String(error.code) : error instanceof Error ? error.constructor.name : undefined;
    }
    return undefined;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    save.mockImplementation((role: Role) => Promise.resolve(role));
  });

  describe('CreateRoleHandler', () => {
    const handler = new CreateRoleHandler(manager);

    it("rechaza permisos con '*'", async () => {
      findOne.mockResolvedValue(null);
      await expect(handler.execute(new CreateRoleCommand('t1', 'Evil', undefined, ['*']))).rejects.toMatchObject({ code: ErrorCode.InvalidPermissions });
      expect(save).not.toHaveBeenCalled();
    });

    it('rechaza un nombre repetido con ROLE_NAME_TAKEN', async () => {
      findOne.mockResolvedValue({ id: 'r1' });
      expect(await codeOf(handler.execute(new CreateRoleCommand('t1', ' Cajero ', undefined, [])))).toBe(ErrorCode.RoleNameTaken);
    });

    it('crea el rol como no-sistema con permisos válidos y nombre recortado', async () => {
      findOne.mockResolvedValue(null);
      const role = await handler.execute(new CreateRoleCommand('t1', ' Cajero ', ' ', [APP_PERMISSIONS.VIEW_POS]));
      expect(role).toMatchObject({ tenantId: 't1', name: 'Cajero', description: null, isSystem: false, permissions: [APP_PERMISSIONS.VIEW_POS] });
    });
  });

  describe('UpdateRoleHandler', () => {
    const handler = new UpdateRoleHandler(manager);

    it('no permite modificar roles del sistema', async () => {
      findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystem: true, name: 'Admin' });
      expect(await codeOf(handler.execute(new UpdateRoleCommand('t1', 'r1', undefined, undefined, [])))).toBe(ErrorCode.RoleIsSystem);
      expect(save).not.toHaveBeenCalled();
    });

    it("rechaza permisos con '*' al editar", async () => {
      findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystem: false, name: 'Cajero' });
      await expect(handler.execute(new UpdateRoleCommand('t1', 'r1', undefined, undefined, ['*']))).rejects.toMatchObject({ code: ErrorCode.InvalidPermissions });
    });

    it('rechaza renombrar a un nombre que ya usa otro rol', async () => {
      findOne.mockResolvedValueOnce({ id: 'r1', tenantId: 't1', isSystem: false, name: 'Cajero' }).mockResolvedValueOnce({ id: 'r2' });
      expect(await codeOf(handler.execute(new UpdateRoleCommand('t1', 'r1', 'Gerente')))).toBe(ErrorCode.RoleNameTaken);
    });

    it('devuelve 404 si el rol no existe en el tenant', async () => {
      findOne.mockResolvedValue(null);
      await expect(handler.execute(new UpdateRoleCommand('t1', 'r1', 'X'))).rejects.toMatchObject({ code: ErrorCode.RoleNotFound });
    });
  });

  describe('DeleteRoleHandler', () => {
    const handler = new DeleteRoleHandler(manager);

    it('no permite eliminar roles del sistema', async () => {
      findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystem: true });
      expect(await codeOf(handler.execute(new DeleteRoleCommand('t1', 'r1')))).toBe(ErrorCode.RoleIsSystem);
      expect(remove).not.toHaveBeenCalled();
    });

    it('no elimina un rol con usuarios asignados e informa cuántos', async () => {
      findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystem: false });
      count.mockResolvedValue(2);
      expect(await codeOf(handler.execute(new DeleteRoleCommand('t1', 'r1')))).toBe(ErrorCode.RoleInUse);
      expect(remove).not.toHaveBeenCalled();
    });

    it('elimina un rol propio sin usuarios asignados', async () => {
      findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', isSystem: false });
      count.mockResolvedValue(0);
      await expect(handler.execute(new DeleteRoleCommand('t1', 'r1'))).resolves.toMatchObject({ success: true });
      expect(remove).toHaveBeenCalled();
    });
  });
});
