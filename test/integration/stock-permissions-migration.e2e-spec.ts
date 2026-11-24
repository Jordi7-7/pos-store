import { DataSource } from 'typeorm';
import { GrantStockPermissionsToExistingRoles1794100000000 } from '../../src/database/migrations/1794100000000-GrantStockPermissionsToExistingRoles';
import { Role } from '../../src/modules/roles/domain/entities/role.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { SeededTenant, seedTenant, startTestDatabase, TestDatabase } from './support/integration-database';

const NEW = ['action:products.stock_entry', 'action:products.stock_exit', 'action:products.stock_count', 'action:products.stock_transfer'];

/** Quien podía ajustar stock sigue pudiendo entrar, sacar y contar; quien no podía, no gana nada. */
describe('Migración de permisos de inventario', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;

  const role = (name: string, permissions: string[]) => db.getRepository(Role).save(db.getRepository(Role).create({ tenantId: shop.tenantId, name, permissions }));
  const migrate = async () => {
    const runner = db.createQueryRunner();
    try {
      await new GrantStockPermissionsToExistingRoles1794100000000().up(runner);
    } finally {
      await runner.release();
    }
  };
  const permissionsOf = async (id: string) => (await db.getRepository(Role).findOneByOrFail({ id })).permissions;

  beforeAll(async () => {
    database = await startTestDatabase('stock-permissions');
    db = database.db;
    shop = await seedTenant(db, 'permisos');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('los roles con el permiso anterior reciben los cuatro nuevos y conservan el resto', async () => {
    const bodega = await role('Bodega vieja', ['view:products', 'action:products.adjust_stock']);

    await migrate();

    expect(await permissionsOf(bodega.id)).toEqual(expect.arrayContaining(['view:products', 'action:products.adjust_stock', ...NEW]));
  });

  it('los roles sin el permiso anterior no ganan nada, y el comodín del propietario no cambia', async () => {
    const cajero = await role('Cajero viejo', ['view:pos', 'action:pos.sell']);
    const owner = await role('Dueño viejo', ['*']);

    await migrate();

    expect(await permissionsOf(cajero.id)).toEqual(['view:pos', 'action:pos.sell']);
    expect(await permissionsOf(owner.id)).toEqual(['*']);
  });

  it('aplicarla otra vez no duplica permisos', async () => {
    const bodega = await role('Bodega repetida', ['action:products.adjust_stock']);

    await migrate();
    await migrate();

    const permissions = await permissionsOf(bodega.id);
    expect(permissions.filter((p) => NEW.includes(p))).toHaveLength(4);
    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it('los usuarios con permisos propios también los reciben; los que no tienen, se quedan sin ellos', async () => {
    const withCustom = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'A', username: 'a-custom', password: 'x', customPermissions: ['action:products.adjust_stock'] }));
    const withoutCustom = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'B', username: 'b-plain', password: 'x' }));

    await migrate();

    expect((await db.getRepository(User).findOneByOrFail({ id: withCustom.id })).customPermissions).toEqual(expect.arrayContaining(NEW));
    expect((await db.getRepository(User).findOneByOrFail({ id: withoutCustom.id })).customPermissions).toBeNull();
  });
});
