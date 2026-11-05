import { DataSource } from 'typeorm';
import { APP_PERMISSIONS } from '../../src/common/enums/permissions.enum';
import { AuthTokenService } from '../../src/modules/auth/services/auth-token.service';
import { HashService } from '../../src/modules/auth/services/hash.service';
import { CreateRoleCommand } from '../../src/modules/roles/application/commands/create-role/create-role.command';
import { CreateRoleHandler } from '../../src/modules/roles/application/commands/create-role/create-role.handler';
import { UpdateRoleCommand } from '../../src/modules/roles/application/commands/update-role/update-role.command';
import { UpdateRoleHandler } from '../../src/modules/roles/application/commands/update-role/update-role.handler';
import { Role } from '../../src/modules/roles/domain/entities/role.entity';
import { CreateUserCommand } from '../../src/modules/users/application/commands/create-user/create-user.command';
import { CreateUserHandler } from '../../src/modules/users/application/commands/create-user/create-user.handler';
import { GeneratePinCommand } from '../../src/modules/users/application/commands/generate-pin/generate-pin.command';
import { GeneratePinHandler } from '../../src/modules/users/application/commands/generate-pin/generate-pin.handler';
import { UpdateUserCommand, UpdateUserInput } from '../../src/modules/users/application/commands/update-user/update-user.command';
import { UpdateUserHandler } from '../../src/modules/users/application/commands/update-user/update-user.handler';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

const P = APP_PERMISSIONS;
const ESCALATION = { code: 'PERMISSION_ESCALATION' };

/**
 * Nadie puede conceder, ni administrar a quien tenga, más poder del que él mismo tiene:
 * un gerente con permiso de editar usuarios y roles no puede convertirse en administrador.
 */
describe('Escalada de privilegios', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let managerId: string;
  let cashierId: string;
  let adminId: string;
  let cashierRoleId: string;
  let adminRoleId: string;
  let revoked: string[];

  const makeRole = (name: string, permissions: string[]) =>
    db.getRepository(Role).save(db.getRepository(Role).create({ tenantId: shop.tenantId, name, permissions, isSystem: false })).then((r) => r.id);
  const makeUser = (username: string, roleId: string, customPermissions: string[] | null = null) =>
    db
      .getRepository(User)
      .save(db.getRepository(User).create({ tenantId: shop.tenantId, name: username, username, password: 'x', isOwner: false, roleId, customPermissions }))
      .then((u) => u.id);

  const updateUser = (actorId: string, targetId: string, input: UpdateUserInput) =>
    new UpdateUserHandler(db.manager, new HashService(), redisStub, { revokeSession: (id: string) => Promise.resolve(void revoked.push(id)) } as unknown as AuthTokenService).execute(
      new UpdateUserCommand(shop.tenantId, targetId, input, actorId),
    );
  const createUser = (actorId: string, username: string, roleId?: string, customPermissions?: string[]) =>
    new CreateUserHandler(db.manager, new HashService()).execute(
      new CreateUserCommand(shop.tenantId, 'Nuevo', username, 'clave-segura-1', undefined, undefined, roleId, customPermissions, [shop.branchId], actorId),
    );
  const generatePin = (actorId: string, targetId: string) =>
    new GeneratePinHandler(db.manager, new HashService()).execute(new GeneratePinCommand(shop.tenantId, targetId, actorId));
  const createRole = (actorId: string, name: string, permissions: string[]) =>
    new CreateRoleHandler(db.manager).execute(new CreateRoleCommand(shop.tenantId, name, undefined, permissions, actorId));
  const updateRole = (actorId: string, roleId: string, permissions: string[]) =>
    new UpdateRoleHandler(db.manager).execute(new UpdateRoleCommand(shop.tenantId, roleId, undefined, undefined, permissions, actorId));

  beforeAll(async () => {
    database = await startTestDatabase('privileges');
    db = database.db;
    shop = await seedTenant(db, 'privilegios');
    revoked = [];

    // El gerente administra usuarios y roles, pero no tiene permisos de caja ni de reembolso
    const managerRoleId = await makeRole('Gerente', [P.VIEW_POS, P.USERS_EDIT, P.USERS_CREATE, P.ROLES_EDIT, P.ROLES_CREATE]);
    cashierRoleId = await makeRole('Cajero', [P.VIEW_POS]);
    adminRoleId = await makeRole('Admin', [P.VIEW_POS, P.USERS_EDIT, P.SALES_REFUND, P.CASH_OPEN_CLOSE]);
    managerId = await makeUser('gerente', managerRoleId);
    cashierId = await makeUser('cajero', cashierRoleId);
    adminId = await makeUser('admin', adminRoleId);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('editar usuarios', () => {
    it('un gerente puede cambiar la contraseña de quien tiene menos poder que él', async () => {
      await expect(updateUser(managerId, cashierId, { password: 'otra-clave-123' })).resolves.toBeDefined();
      expect(revoked).toContain(cashierId);
    });

    it('no puede cambiar la contraseña, el PIN ni desactivar a alguien con más poder', async () => {
      await expect(updateUser(managerId, adminId, { password: 'tomada-123' })).rejects.toMatchObject(ESCALATION);
      await expect(updateUser(managerId, adminId, { pin: '135790' })).rejects.toMatchObject(ESCALATION);
      await expect(updateUser(managerId, adminId, { isActive: false })).rejects.toMatchObject(ESCALATION);
    });

    it('no puede dar a otro un rol con permisos que él no tiene', async () => {
      await expect(updateUser(managerId, cashierId, { roleId: adminRoleId })).rejects.toMatchObject(ESCALATION);
      expect((await db.getRepository(User).findOneByOrFail({ id: cashierId })).roleId).toBe(cashierRoleId);
    });

    it('ni permisos personalizados que no tiene; sí los que tiene', async () => {
      await expect(updateUser(managerId, cashierId, { customPermissions: [P.SALES_REFUND] })).rejects.toMatchObject(ESCALATION);
      await expect(updateUser(managerId, cashierId, { customPermissions: [P.VIEW_POS] })).resolves.toBeDefined();
    });

    it('no puede subirse el poder a sí mismo: ni rol de administrador ni permisos extra', async () => {
      await expect(updateUser(managerId, managerId, { roleId: adminRoleId })).rejects.toMatchObject(ESCALATION);
      await expect(updateUser(managerId, managerId, { customPermissions: [P.SALES_REFUND] })).rejects.toMatchObject(ESCALATION);
      await expect(updateUser(managerId, managerId, { name: 'Gerente 2' })).resolves.toBeDefined();
    });

    it('el propietario puede asignar cualquier rol', async () => {
      await expect(updateUser(shop.ownerId, cashierId, { roleId: adminRoleId })).resolves.toBeDefined();
      await updateUser(shop.ownerId, cashierId, { roleId: cashierRoleId, customPermissions: [] });
    });

    it('sin un usuario que ejecute la acción en la tienda no se concede nada', async () => {
      await expect(updateUser('00000000-0000-4000-8000-000000000000', cashierId, { name: 'X' })).rejects.toMatchObject(ESCALATION);
    });
  });

  describe('crear usuarios', () => {
    it('un gerente crea usuarios con un rol que no supera el suyo', async () => {
      await expect(createUser(managerId, 'nuevo-cajero', cashierRoleId)).resolves.toMatchObject({ username: 'nuevo-cajero' });
    });

    it('no puede crear a alguien con un rol o permisos que él no tiene', async () => {
      await expect(createUser(managerId, 'nuevo-admin', adminRoleId)).rejects.toMatchObject(ESCALATION);
      await expect(createUser(managerId, 'nuevo-extra', cashierRoleId, [P.SALES_REFUND])).rejects.toMatchObject(ESCALATION);
      expect(await db.getRepository(User).existsBy({ tenantId: shop.tenantId, username: 'nuevo-admin' })).toBe(false);
    });

    it('el propietario crea administradores', async () => {
      await expect(createUser(shop.ownerId, 'otro-admin', adminRoleId)).resolves.toBeDefined();
    });
  });

  describe('PIN de otro usuario', () => {
    it('solo se genera el PIN de quien tiene igual o menos poder', async () => {
      await expect(generatePin(managerId, cashierId)).resolves.toMatchObject({ userId: cashierId });
      await expect(generatePin(managerId, adminId)).rejects.toMatchObject(ESCALATION);
      await expect(generatePin(shop.ownerId, adminId)).resolves.toMatchObject({ userId: adminId });
    });
  });

  describe('roles', () => {
    it('un gerente solo crea y edita roles con permisos que él tiene', async () => {
      const role = await createRole(managerId, 'Ayudante', [P.VIEW_POS]);
      expect(role.permissions).toEqual([P.VIEW_POS]);

      await expect(createRole(managerId, 'Superrol', [P.VIEW_POS, P.SALES_REFUND])).rejects.toMatchObject(ESCALATION);
      await expect(updateRole(managerId, role.id, [P.CASH_OPEN_CLOSE])).rejects.toMatchObject(ESCALATION);
      expect((await db.getRepository(Role).findOneByOrFail({ id: role.id })).permissions).toEqual([P.VIEW_POS]);
    });

    it('el propietario crea roles con cualquier permiso válido', async () => {
      await expect(createRole(shop.ownerId, 'Superrol', [P.SALES_REFUND, P.CASH_OPEN_CLOSE])).resolves.toBeDefined();
    });
  });
});

