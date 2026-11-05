import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { Role } from '../../domain/entities/role.entity';
import { RolesController } from './roles.controller';

describe('RolesController', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const remove = jest.fn();
  const count = jest.fn();

  const executeUpdate = jest.fn();
  const qb = {
    update: () => qb,
    set: () => qb,
    where: () => qb,
    execute: executeUpdate,
  };
  const entityManager = {
    getRepository: () => ({
      findOne,
      save,
      remove,
      count,
      createQueryBuilder: () => qb,
    }),
  } as unknown as EntityManager;
  const controller = new RolesController(entityManager);

  beforeEach(() => {
    jest.resetAllMocks();
    save.mockImplementation((r: Role) => Promise.resolve(r));
  });

  describe('createRole', () => {
    it("rechaza permisos con '*'", async () => {
      findOne.mockResolvedValue(null);

      await expect(
        controller.createRole('t1', { name: 'Evil', permissions: ['*'] }),
      ).rejects.toThrow(BadRequestException);
      expect(save).not.toHaveBeenCalled();
    });

    it('crea el rol como no-sistema con permisos válidos', async () => {
      findOne.mockResolvedValue(null);

      const role = await controller.createRole('t1', {
        name: 'Cajero',
        permissions: [APP_PERMISSIONS.VIEW_POS],
      });

      expect(role).toMatchObject({
        tenantId: 't1',
        isSystem: false,
        permissions: [APP_PERMISSIONS.VIEW_POS],
      });
    });
  });

  describe('updateRole', () => {
    it('no permite modificar roles del sistema', async () => {
      findOne.mockResolvedValue({
        id: 'r1',
        tenantId: 't1',
        isSystem: true,
        name: 'Admin',
      });

      await expect(
        controller.updateRole('t1', 'r1', { permissions: [] }),
      ).rejects.toThrow(ForbiddenException);
      expect(save).not.toHaveBeenCalled();
    });

    it("rechaza permisos con '*' al editar", async () => {
      findOne.mockResolvedValue({
        id: 'r1',
        tenantId: 't1',
        isSystem: false,
        name: 'Cajero',
      });

      await expect(
        controller.updateRole('t1', 'r1', { permissions: ['*'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteRole', () => {
    it('no permite eliminar roles del sistema', async () => {
      findOne.mockResolvedValue({
        id: 'r1',
        tenantId: 't1',
        isSystem: true,
      });

      await expect(controller.deleteRole('t1', 'r1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(remove).not.toHaveBeenCalled();
    });

    it('elimina un rol propio sin usuarios asignados', async () => {
      findOne.mockResolvedValue({
        id: 'r1',
        tenantId: 't1',
        isSystem: false,
      });
      count.mockResolvedValue(0);

      await expect(controller.deleteRole('t1', 'r1')).resolves.toMatchObject({
        success: true,
      });
      expect(remove).toHaveBeenCalled();
    });
  });
});
