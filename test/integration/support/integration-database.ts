import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RedisService } from '../../../src/common/redis/redis.service';
import { databaseConnectionOptions } from '../../../src/config/database.options';
import { Branch } from '../../../src/modules/branches/domain/entities/branch.entity';
import { ProductVariant } from '../../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../../src/modules/products/domain/entities/product.entity';
import { Supplier } from '../../../src/modules/purchases/domain/entities/supplier.entity';
import { Tenant } from '../../../src/modules/tenants/domain/entities/tenant.entity';
import { User } from '../../../src/modules/users/domain/entities/user.entity';

/** Redis de mentira: sin caché, nada falla. */
export const redisStub = {
  get: () => Promise.resolve(null),
  set: () => Promise.resolve(),
  del: () => Promise.resolve(),
} as unknown as RedisService;

export interface TestDatabase {
  db: DataSource;
  databaseName: string;
  destroy: () => Promise<void>;
}

/**
 * Crea una base de datos propia con nombre único, aplica todas las migraciones y devuelve la
 * conexión. `destroy` la borra: nunca toca la base configurada en DB_DATABASE.
 */
export async function startTestDatabase(label: string, fixedName?: string): Promise<TestDatabase> {
  dotenv.config();
  const databaseName = fixedName ?? `pos_store_it_${label}_${process.pid}_${Date.now()}`;
  // Con un nombre fijo (tests HTTP) DB_DATABASE ya apunta a la base de prueba: se conecta a `postgres` para crearla
  const admin = await new DataSource({ ...databaseConnectionOptions(), database: 'postgres', entities: [] }).initialize();
  await admin.query(`CREATE DATABASE "${databaseName}"`);

  const db = await new DataSource({
    ...databaseConnectionOptions(),
    database: databaseName,
    migrations: [path.join(__dirname, '../../../src/database/migrations/*.ts')],
  }).initialize();
  await db.runMigrations();

  return {
    db,
    databaseName,
    destroy: async () => {
      await db.destroy();
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.destroy();
    },
  };
}

export interface SeededTenant {
  tenantId: string;
  branchId: string;
  /** Propietario: puede operar en cualquier sucursal. */
  ownerId: string;
  supplierId: string;
}

/** Tienda con una sucursal, su propietario y un proveedor. `key` hace únicos el RUC, el slug y los usuarios. */
export async function seedTenant(db: DataSource, key: string): Promise<SeededTenant> {
  const tenant = await db.getRepository(Tenant).save(
    db.getRepository(Tenant).create({
      name: `Tienda ${key}`,
      ruc: `09${key.padEnd(11, '0')}`.slice(0, 13),
      country: 'EC',
      currencyCode: 'USD',
      currencySymbol: '$',
      slug: `tienda-${key}`,
    }),
  );
  const branch = await db.getRepository(Branch).save(
    db.getRepository(Branch).create({ tenantId: tenant.id, name: 'Matriz', address: 'Centro', code: 1 }),
  );
  const owner = await db.getRepository(User).save(
    db.getRepository(User).create({ tenantId: tenant.id, name: 'Dueño', username: `owner-${key}`, password: 'x', isOwner: true }),
  );
  const supplier = await db.getRepository(Supplier).save(
    db.getRepository(Supplier).create({ tenantId: tenant.id, identityNumber: 'GENERICO', name: 'Proveedor' }),
  );
  return { tenantId: tenant.id, branchId: branch.id, ownerId: owner.id, supplierId: supplier.id };
}

/** Producto con una variante simple; devuelve el id de la variante. */
export async function seedVariant(
  db: DataSource,
  tenantId: string,
  sku: string,
  prices: { purchasePrice?: number; salePrice?: number } = {},
): Promise<string> {
  const product = await db.getRepository(Product).save(
    db.getRepository(Product).create({ tenantId, name: sku, description: sku }),
  );
  const variant = await db.getRepository(ProductVariant).save(
    db.getRepository(ProductVariant).create({
      productId: product.id,
      tenantId,
      sku,
      barcode: sku,
      purchasePrice: prices.purchasePrice ?? 4,
      salePrice: prices.salePrice ?? 10,
    }),
  );
  return variant.id;
}
