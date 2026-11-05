import { DataSource } from 'typeorm';
import { CreateSupplierCommand } from '../../src/modules/purchases/application/commands/create-supplier/create-supplier.command';
import { CreateSupplierHandler } from '../../src/modules/purchases/application/commands/create-supplier/create-supplier.handler';
import { DeleteSupplierCommand } from '../../src/modules/purchases/application/commands/delete-supplier/delete-supplier.command';
import { DeleteSupplierHandler } from '../../src/modules/purchases/application/commands/delete-supplier/delete-supplier.handler';
import { RegisterPurchaseCommand } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.command';
import { RegisterPurchaseHandler } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.handler';
import { UpdateSupplierCommand, UpdateSupplierInput } from '../../src/modules/purchases/application/commands/update-supplier/update-supplier.command';
import { UpdateSupplierHandler } from '../../src/modules/purchases/application/commands/update-supplier/update-supplier.handler';
import { GetSuppliersHandler } from '../../src/modules/purchases/application/queries/get-suppliers/get-suppliers.handler';
import { GetSuppliersQuery } from '../../src/modules/purchases/application/queries/get-suppliers/get-suppliers.query';
import { PurchaseOrder } from '../../src/modules/purchases/domain/entities/purchase-order.entity';
import { Supplier } from '../../src/modules/purchases/domain/entities/supplier.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Proveedores con los handlers reales sobre Postgres: unicidad por tienda, carreras y borrado. */
describe('Proveedores', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const create = (identityNumber: string, extra: { email?: string; phone?: string; address?: string } = {}, tenantId = shop.tenantId) =>
    new CreateSupplierHandler(db.manager).execute(new CreateSupplierCommand(tenantId, identityNumber, `Proveedor ${identityNumber}`, extra.email, extra.phone, extra.address));
  const update = (id: string, input: UpdateSupplierInput, tenantId = shop.tenantId) =>
    new UpdateSupplierHandler(db.getRepository(Supplier)).execute(new UpdateSupplierCommand(tenantId, id, input));
  const remove = (id: string, tenantId = shop.tenantId) =>
    new DeleteSupplierHandler(db.getRepository(Supplier), db.getRepository(PurchaseOrder)).execute(new DeleteSupplierCommand(tenantId, id));
  const list = (tenantId = shop.tenantId) => new GetSuppliersHandler(db.manager).execute(new GetSuppliersQuery(tenantId));

  beforeAll(async () => {
    database = await startTestDatabase('suppliers');
    db = database.db;
    shop = await seedTenant(db, 'proveedores');
    other = await seedTenant(db, 'ajena-prov');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('crea un proveedor y guarda como null el correo, teléfono y dirección vacíos', async () => {
    const supplier = await create('0991111111001', { email: '', phone: undefined, address: 'Av. 1' });
    expect(supplier).toMatchObject({ identityNumber: '0991111111001', email: null, phone: null, address: 'Av. 1' });
  });

  it('el documento es único por tienda: se rechaza repetido, otra tienda puede usarlo', async () => {
    await expect(create('0991111111001')).rejects.toMatchObject({ code: 'SUPPLIER_IDENTITY_TAKEN', details: { identityNumber: '0991111111001' } });
    await expect(create('0991111111001', {}, other.tenantId)).resolves.toBeDefined();
  });

  it('dos altas simultáneas con el mismo documento: una gana y la otra recibe SUPPLIER_IDENTITY_TAKEN, no un 500', async () => {
    const results = await Promise.allSettled([create('0992222222001'), create('0992222222001')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'SUPPLIER_IDENTITY_TAKEN' });
    expect(await db.getRepository(Supplier).countBy({ tenantId: shop.tenantId, identityNumber: '0992222222001' })).toBe(1);
  });

  it('edita datos, permite conservar el propio documento y rechaza el de otro proveedor', async () => {
    const a = await create('0993333333001');
    await create('0994444444001');

    const updated = await update(a.id, { name: 'Nuevo nombre', identityNumber: '0993333333001', phone: '099', email: '' });
    expect(updated).toMatchObject({ name: 'Nuevo nombre', phone: '099', email: null });
    await expect(update(a.id, { identityNumber: '0994444444001' })).rejects.toMatchObject({ code: 'SUPPLIER_IDENTITY_TAKEN' });
    await expect(update(a.id, { name: 'Robado' }, other.tenantId)).rejects.toMatchObject({ code: 'SUPPLIER_NOT_FOUND' });
  });

  it('un proveedor con compras no se elimina; uno sin compras sí, y su documento queda libre', async () => {
    const used = await create('0995555555001');
    const variantId = await seedVariant(db, shop.tenantId, 'PROV-1');
    await new RegisterPurchaseHandler(db.manager, redisStub).execute(
      new RegisterPurchaseCommand(shop.tenantId, shop.ownerId, used.id, shop.branchId, 'F-1', [{ variantId, quantity: 1, purchasePrice: 3 }]),
    );
    await expect(remove(used.id)).rejects.toMatchObject({ code: 'SUPPLIER_HAS_PURCHASES' });

    const free = await create('0996666666001');
    await expect(remove(free.id)).resolves.toBeDefined();
    await expect(remove(free.id)).rejects.toMatchObject({ code: 'SUPPLIER_NOT_FOUND' });
    await expect(create('0996666666001')).resolves.toBeDefined();
  });

  it('no se puede eliminar un proveedor de otra tienda', async () => {
    const mine = await create('0997777777001');
    await expect(remove(mine.id, other.tenantId)).rejects.toMatchObject({ code: 'SUPPLIER_NOT_FOUND' });
    expect(await db.getRepository(Supplier).findOneBy({ id: mine.id })).not.toBeNull();
  });

  it('el listado solo trae los proveedores de la tienda, los más recientes primero, sin los borrados', async () => {
    const gone = await create('0998888888001');
    await remove(gone.id);
    const suppliers = await list();
    expect(suppliers.every((s) => s.tenantId === shop.tenantId)).toBe(true);
    expect(suppliers.map((s) => s.identityNumber)).not.toContain('0998888888001');
    expect(suppliers[0].createdAt.getTime()).toBeGreaterThanOrEqual(suppliers[suppliers.length - 1].createdAt.getTime());
  });

  describe('migración del índice único', () => {
    it('se detiene con un mensaje claro si ya hay documentos repetidos, y se aplica cuando se resuelven', async () => {
      // Se deshacen las migraciones hasta quitar el índice para simular una base con datos antiguos
      const indexExists = async () => (await db.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_suppliers_tenant_identity'`)).length > 0;
      for (let undone = 0; undone < 10 && (await indexExists()); undone++) {
        await db.undoLastMigration();
      }
      await db.query(`INSERT INTO suppliers (tenant_id, identity_number, name) VALUES ($1, 'DUP-1', 'Uno'), ($1, 'DUP-1', 'Dos')`, [shop.tenantId]);

      await expect(db.runMigrations()).rejects.toThrow(/documentos de proveedor repetidos.*DUP-1/);
      expect(await indexExists()).toBe(false);

      await db.query(`DELETE FROM suppliers WHERE identity_number = 'DUP-1' AND name = 'Dos'`);
      await db.runMigrations();
      expect(await indexExists()).toBe(true);
    });
  });
});
