import { DataSource } from 'typeorm';
import { AddUniqueCatalogNames1794400000000 } from '../../src/database/migrations/1794400000000-AddUniqueCatalogNames';
import { CreateAttributeCommand } from '../../src/modules/products/application/commands/create-attribute/create-attribute.command';
import { CreateAttributeHandler } from '../../src/modules/products/application/commands/create-attribute/create-attribute.handler';
import { CreateAttributeValueCommand } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.command';
import { CreateAttributeValueHandler } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.handler';
import { CreateCategoryCommand } from '../../src/modules/products/application/commands/create-category/create-category.command';
import { CreateCategoryHandler } from '../../src/modules/products/application/commands/create-category/create-category.handler';
import { Attribute } from '../../src/modules/products/domain/entities/attribute.entity';
import { AttributeValue } from '../../src/modules/products/domain/entities/attribute-value.entity';
import { Category } from '../../src/modules/products/domain/entities/category.entity';
import { CreateRoleCommand } from '../../src/modules/roles/application/commands/create-role/create-role.command';
import { CreateRoleHandler } from '../../src/modules/roles/application/commands/create-role/create-role.handler';
import { UpdateRoleCommand } from '../../src/modules/roles/application/commands/update-role/update-role.command';
import { UpdateRoleHandler } from '../../src/modules/roles/application/commands/update-role/update-role.handler';
import { Role } from '../../src/modules/roles/domain/entities/role.entity';
import { SeededTenant, seedTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Dos peticiones a la vez con el mismo nombre: una gana y la otra recibe el error de negocio, nunca un duplicado ni un 500. */
describe('Nombres únicos del catálogo bajo concurrencia', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let round = 0;

  const bothAtOnce = <T>(make: () => Promise<T>) => Promise.allSettled([make(), make()]);
  const outcome = (results: PromiseSettledResult<unknown>[]) => ({
    created: results.filter((result) => result.status === 'fulfilled').length,
    codes: results.flatMap((result) => (result.status === 'rejected' ? [(result.reason as { code?: string }).code] : [])),
  });

  beforeAll(async () => {
    database = await startTestDatabase('catalog-unique');
    db = database.db;
    shop = await seedTenant(db, 'unicos');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('dos categorías con el mismo nombre a la vez: se crea una y la otra recibe CATEGORY_NAME_TAKEN', async () => {
    for (let i = 0; i < 5; i++) {
      const name = `Categoría ${++round}`;
      const results = await bothAtOnce(() => new CreateCategoryHandler(db.manager).execute(new CreateCategoryCommand(shop.tenantId, name)));
      expect(outcome(results)).toEqual({ created: 1, codes: ['CATEGORY_NAME_TAKEN'] });
      expect(await db.getRepository(Category).countBy({ tenantId: shop.tenantId, name })).toBe(1);
    }
  });

  it('dos atributos con el mismo nombre a la vez: se crea uno y el otro recibe ATTRIBUTE_NAME_TAKEN', async () => {
    for (let i = 0; i < 5; i++) {
      const name = `Atributo ${++round}`;
      const results = await bothAtOnce(() => new CreateAttributeHandler(db.manager).execute(new CreateAttributeCommand(shop.tenantId, name)));
      expect(outcome(results)).toEqual({ created: 1, codes: ['ATTRIBUTE_NAME_TAKEN'] });
      expect(await db.getRepository(Attribute).countBy({ tenantId: shop.tenantId, name })).toBe(1);
    }
  });

  it('dos opciones iguales del mismo atributo a la vez: se crea una y la otra recibe ATTRIBUTE_VALUE_TAKEN', async () => {
    const attribute = await new CreateAttributeHandler(db.manager).execute(new CreateAttributeCommand(shop.tenantId, 'Talla única'));
    for (let i = 0; i < 5; i++) {
      const value = `T${++round}`;
      const results = await bothAtOnce(() => new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, attribute.id, value)));
      expect(outcome(results)).toEqual({ created: 1, codes: ['ATTRIBUTE_VALUE_TAKEN'] });
      expect(await db.getRepository(AttributeValue).countBy({ attributeId: attribute.id, value })).toBe(1);
    }
  });

  it('la misma opción en dos atributos distintos sí se permite', async () => {
    const [a, b] = await Promise.all(['Color A', 'Color B'].map((name) => new CreateAttributeHandler(db.manager).execute(new CreateAttributeCommand(shop.tenantId, name))));
    await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, a.id, 'Rojo'));
    await expect(new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, b.id, 'Rojo'))).resolves.toBeDefined();
  });

  it('dos roles con el mismo nombre a la vez: se crea uno y el otro recibe ROLE_NAME_TAKEN', async () => {
    for (let i = 0; i < 5; i++) {
      const name = `Rol ${++round}`;
      const results = await bothAtOnce(() => new CreateRoleHandler(db.manager).execute(new CreateRoleCommand(shop.tenantId, name, undefined, ['view:products'], shop.ownerId)));
      expect(outcome(results)).toEqual({ created: 1, codes: ['ROLE_NAME_TAKEN'] });
      expect(await db.getRepository(Role).countBy({ tenantId: shop.tenantId, name })).toBe(1);
    }
  });

  it('dos roles que se renombran al mismo nombre a la vez: uno lo consigue y el otro recibe ROLE_NAME_TAKEN', async () => {
    const [first, second] = await Promise.all(['Origen 1', 'Origen 2'].map((name) => new CreateRoleHandler(db.manager).execute(new CreateRoleCommand(shop.tenantId, name, undefined, ['view:products'], shop.ownerId))));
    const results = await Promise.allSettled([first, second].map((role) => new UpdateRoleHandler(db.manager).execute(new UpdateRoleCommand(shop.tenantId, role.id, 'Destino', undefined, undefined, shop.ownerId))));
    expect(outcome(results)).toEqual({ created: 1, codes: ['ROLE_NAME_TAKEN'] });
  });

  describe('migración', () => {
    const run = async (direction: 'up' | 'down') => {
      const runner = db.createQueryRunner();
      try {
        const migration = new AddUniqueCatalogNames1794400000000();
        await (direction === 'up' ? migration.up(runner) : migration.down(runner));
      } finally {
        await runner.release();
      }
    };

    it('si ya hay nombres repetidos se detiene con un mensaje claro y, resueltos, se aplica', async () => {
      await run('down'); // como estaba una base antigua, sin los índices
      const name = 'Repetida antigua';
      await db.getRepository(Category).insert([
        { tenantId: shop.tenantId, name },
        { tenantId: shop.tenantId, name },
      ]);

      await expect(run('up')).rejects.toThrow(/nombres repetidos entre categorías.*Repetida antigua/);

      const [, second] = await db.getRepository(Category).findBy({ tenantId: shop.tenantId, name });
      await db.getRepository(Category).softDelete(second.id); // un duplicado eliminado no cuenta
      await expect(run('up')).resolves.toBeUndefined();
      await expect(new CreateCategoryHandler(db.manager).execute(new CreateCategoryCommand(shop.tenantId, name))).rejects.toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
    });
  });
});
