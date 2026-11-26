import { DataSource } from 'typeorm';
import { RemoveLegacyAdjustStockPermission1794200000000 } from '../../src/database/migrations/1794200000000-RemoveLegacyAdjustStockPermission';
import { Role } from '../../src/modules/roles/domain/entities/role.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { SeededTenant, seedTenant, startTestDatabase, TestDatabase } from './support/integration-database';

const LEGACY = 'action:products.adjust_stock';

/** El permiso heredado desaparece de roles y usuarios; lo demás queda igual. */
describe('Migración que retira el permiso de ajuste heredado', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;

  const role = (name: string, permissions: string[]) => db.getRepository(Role).save(db.getRepository(Role).create({ tenantId: shop.tenantId, name, permissions }));
  const migrate = async () => {
    const runner = db.createQueryRunner();
    try {
      await new RemoveLegacyAdjustStockPermission1794200000000().up(runner);
    } finally {
      await runner.release();
    }
  };
  const permissionsOf = async (id: string) => (await db.getRepository(Role).findOneByOrFail({ id })).permissions;

  beforeAll(async () => {
    database = await startTestDatabase('legacy-permission');
    db = database.db;
    shop = await seedTenant(db, 'heredado');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('se quita de los roles que lo tenían y conservan todo lo demás; los demás roles no cambian', async () => {
    const bodega = await role('Bodega', ['view:products', LEGACY, 'action:products.stock_entry']);
    const cajero = await role('Cajero', ['view:pos', 'action:pos.sell']);
    const owner = await role('Dueño', ['*']);

    await migrate();

    expect(await permissionsOf(bodega.id)).toEqual(['view:products', 'action:products.stock_entry']);
    expect(await permissionsOf(cajero.id)).toEqual(['view:pos', 'action:pos.sell']);
    expect(await permissionsOf(owner.id)).toEqual(['*']);
  });

  it('se quita también de los permisos propios de los usuarios; quien no tiene permisos propios sigue sin ellos', async () => {
    const withCustom = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'A', username: 'a-custom', password: 'x', customPermissions: [LEGACY, 'view:products'] }));
    const withoutCustom = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'B', username: 'b-plain', password: 'x' }));

    await migrate();

    expect((await db.getRepository(User).findOneByOrFail({ id: withCustom.id })).customPermissions).toEqual(['view:products']);
    expect((await db.getRepository(User).findOneByOrFail({ id: withoutCustom.id })).customPermissions).toBeNull();
  });

  it('aplicarla otra vez no cambia nada', async () => {
    const bodega = await role('Bodega repetida', [LEGACY, 'view:products']);

    await migrate();
    await migrate();

    expect(await permissionsOf(bodega.id)).toEqual(['view:products']);
  });
});
