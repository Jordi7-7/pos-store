import { DataSource } from 'typeorm';
import { GetBatchesHandler } from '../../src/modules/batches/application/queries/get-batches/get-batches.handler';
import { GetBatchesQuery } from '../../src/modules/batches/application/queries/get-batches/get-batches.query';
import { GetBatchesByVariantHandler } from '../../src/modules/batches/application/queries/get-batches-by-variant/get-batches-by-variant.handler';
import { GetBatchesByVariantQuery } from '../../src/modules/batches/application/queries/get-batches-by-variant/get-batches-by-variant.query';
import { BatchOriginType, BatchStatus } from '../../src/modules/batches/domain/entities/batch.entity';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { RegisterPurchaseCommand } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.command';
import { RegisterPurchaseHandler } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.handler';
import { UpdateTenantCommand, UpdateTenantInput } from '../../src/modules/tenants/application/commands/update-tenant/update-tenant.command';
import { UpdateTenantHandler } from '../../src/modules/tenants/application/commands/update-tenant/update-tenant.handler';
import { GetPublicTenantBySlugHandler } from '../../src/modules/tenants/application/queries/get-public-tenant-by-slug/get-public-tenant-by-slug.handler';
import { GetPublicTenantBySlugQuery } from '../../src/modules/tenants/application/queries/get-public-tenant-by-slug/get-public-tenant-by-slug.query';
import { GetTenantHandler } from '../../src/modules/tenants/application/queries/get-tenant/get-tenant.handler';
import { GetTenantQuery } from '../../src/modules/tenants/application/queries/get-tenant/get-tenant.query';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { S3Service } from '../../src/modules/media/services/s3.service';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Tienda (ajustes y datos públicos) y lotes de inventario con los handlers reales sobre Postgres. */
describe('Tienda y lotes', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  // S3 real en lo que decide a quién pertenece un archivo; solo el borrado remoto es falso
  const deleted: string[] = [];
  const s3 = Object.assign(Object.create(S3Service.prototype) as S3Service, {
    deleteFile: (key: string) => {
      deleted.push(key);
      return Promise.resolve();
    },
  });
  const logoOf = (tenantId: string, name: string) => `${s3.tenantKeyPrefix(tenantId)}logo/${name}`;

  const updateTenant = (input: UpdateTenantInput, tenantId = shop.tenantId) =>
    new UpdateTenantHandler(db.manager, s3).execute(new UpdateTenantCommand(tenantId, input));
  const tenantRow = (tenantId = shop.tenantId) => db.getRepository(Tenant).findOneByOrFail({ id: tenantId });

  beforeAll(async () => {
    database = await startTestDatabase('tenants_batches');
    db = database.db;
    shop = await seedTenant(db, 'ajustes');
    other = await seedTenant(db, 'vecina');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('ajustes de la tienda', () => {
    it('cambia nombre, país, zona horaria y deduce el símbolo de la moneda', async () => {
      const updated = await updateTenant({ name: 'Nuevo nombre', country: 'PE', currencyCode: 'PEN', timezone: 'America/Lima' });
      expect(updated).toMatchObject({ name: 'Nuevo nombre', country: 'PE', currencyCode: 'PEN', timezone: 'America/Lima' });
      expect(updated.currencySymbol).not.toBe('');
    });

    it('normaliza el slug y rechaza uno que ya usa otra tienda', async () => {
      await expect(updateTenant({ slug: ' Mi Tienda Ñ ' })).resolves.toMatchObject({ slug: 'mi-tienda-n' });
      await expect(updateTenant({ slug: 'mi-tienda-n' }, other.tenantId)).rejects.toMatchObject({ code: 'TENANT_SLUG_TAKEN' });
      expect((await tenantRow(other.tenantId)).slug).toBe('tienda-vecina');
    });

    it('rechaza un slug sin letras ni números en vez de dejar uno vacío', async () => {
      await expect(updateTenant({ slug: '###' })).rejects.toMatchObject({ code: 'TENANT_SLUG_INVALID' });
      expect((await tenantRow()).slug).toBe('mi-tienda-n');
    });

    it('dos cambios simultáneos al mismo slug: uno gana y el otro recibe TENANT_SLUG_TAKEN', async () => {
      const results = await Promise.allSettled([updateTenant({ slug: 'disputado' }, shop.tenantId), updateTenant({ slug: 'disputado' }, other.tenantId)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'TENANT_SLUG_TAKEN' });
    });

    it('solo acepta un logo del espacio de la propia tienda y borra el anterior después de guardar', async () => {
      await expect(updateTenant({ logoUrl: logoOf(other.tenantId, 'ajeno.png') })).rejects.toMatchObject({ code: 'MEDIA_NOT_OWNED' });
      expect((await tenantRow()).logoUrl).toBeNull();

      await updateTenant({ logoUrl: logoOf(shop.tenantId, 'uno.png') });
      expect(deleted).toEqual([]);

      await updateTenant({ logoUrl: logoOf(shop.tenantId, 'dos.png') });
      expect(deleted).toEqual([logoOf(shop.tenantId, 'uno.png')]);
    });

    it('si el guardado falla, el logo vigente no se borra del almacenamiento', async () => {
      deleted.length = 0;
      await updateTenant({ logoUrl: logoOf(shop.tenantId, 'tres.png'), slug: 'tienda-vecina' }).catch(() => undefined);
      expect(deleted).toEqual([]);
      expect((await tenantRow()).logoUrl).toBe(logoOf(shop.tenantId, 'dos.png'));
    });

    it('una tienda inexistente responde TENANT_NOT_FOUND', async () => {
      await expect(updateTenant({ name: 'X' }, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });
  });

  describe('consulta de tienda', () => {
    it('la ficha pública se busca por slug sin importar mayúsculas y no expone el RUC', async () => {
      const result = await new GetPublicTenantBySlugHandler(db.manager).execute(new GetPublicTenantBySlugQuery('  TIENDA-VECINA '));
      expect(result).toMatchObject({ id: other.tenantId, slug: 'tienda-vecina' });
      expect(Object.keys(result)).not.toContain('ruc');
      await expect(new GetPublicTenantBySlugHandler(db.manager).execute(new GetPublicTenantBySlugQuery('no-existe'))).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });

    it('get-tenant devuelve la tienda pedida o TENANT_NOT_FOUND', async () => {
      await expect(new GetTenantHandler(db.manager).execute(new GetTenantQuery(shop.tenantId))).resolves.toMatchObject({ id: shop.tenantId });
      await expect(new GetTenantHandler(db.manager).execute(new GetTenantQuery('00000000-0000-0000-0000-000000000000'))).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
    });
  });

  describe('lotes de inventario', () => {
    let variantId: string;
    let secondBranchId: string;
    let cashierId: string;

    const buy = (branchId: string, quantity: number, invoice: string, tenant = shop) =>
      new RegisterPurchaseHandler(db.manager, redisStub).execute(
        new RegisterPurchaseCommand(tenant.tenantId, tenant.ownerId, tenant.supplierId, branchId, invoice, [{ variantId, quantity, purchasePrice: 5 }]),
      );
    const listBatches = (args: Partial<{ branchId: string; search: string; page: number; limit: number; userId: string; isOwner: boolean; originTypes: BatchOriginType[] }> = {}) =>
      new GetBatchesHandler(db.manager, redisStub).execute(
        new GetBatchesQuery(shop.tenantId, args.branchId, undefined, undefined, args.search, args.page ?? 1, args.limit ?? 10, args.userId ?? shop.ownerId, args.isOwner ?? true, args.originTypes),
      );

    beforeAll(async () => {
      variantId = await seedVariant(db, shop.tenantId, 'LOTE-1');
      const second = await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }));
      secondBranchId = second.id;
      const cashier = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-lotes', password: 'x', isOwner: false }));
      cashierId = cashier.id;
      await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);

      await buy(shop.branchId, 10, 'FAC-100');
      await buy(shop.branchId, 4, 'FAC-200');
      await buy(secondBranchId, 7, 'FAC-300');
    });

    it('lista los lotes de la tienda con origen, cantidades y valor, más recientes primero', async () => {
      const { data, meta } = await listBatches();
      expect(meta.total).toBe(3);
      expect(data.map((b) => b.originReference)).toEqual(['Factura: FAC-300', 'Factura: FAC-200', 'Factura: FAC-100']);
      const batch = data.find((b) => b.originReference === 'Factura: FAC-100');
      expect(batch).toMatchObject({ totalInitialQuantity: 10, totalRemainingQuantity: 10, totalCostValue: 50, status: 'ACTIVE' });
    });

    it('filtra por sucursal, por búsqueda y pagina', async () => {
      expect((await listBatches({ branchId: secondBranchId })).meta.total).toBe(1);
      expect((await listBatches({ search: 'fac-200' })).data).toHaveLength(1);
      const page = await listBatches({ page: 2, limit: 2 });
      expect(page.data).toHaveLength(1);
      expect(page.meta).toMatchObject({ total: 3, page: 2, totalPages: 2 });
    });

    it('filtra por tipo de lote, uno o varios', async () => {
      const total = (await listBatches()).meta.total;
      const [target] = (await listBatches()).data;
      await db.query(`UPDATE batches SET origin_type = 'REFUND' WHERE id = $1`, [target.id]);
      try {
        expect((await listBatches({ originTypes: [BatchOriginType.REFUND] })).data.map((b) => b.id)).toEqual([target.id]);
        expect((await listBatches({ originTypes: [BatchOriginType.PURCHASE] })).meta.total).toBe(total - 1);
        expect((await listBatches({ originTypes: [BatchOriginType.PURCHASE, BatchOriginType.REFUND] })).meta.total).toBe(total);
        expect((await listBatches({ originTypes: [BatchOriginType.ADJUSTMENT] })).meta.total).toBe(0);
        expect((await listBatches({ originTypes: [] })).meta.total).toBe(total);
      } finally {
        await db.query(`UPDATE batches SET origin_type = 'PURCHASE' WHERE id = $1`, [target.id]);
      }
    });

    it('un lote consumido aparece como agotado', async () => {
      await db.query(`UPDATE product_batches SET remaining_quantity = 0 WHERE batch_id IN (SELECT id FROM batches WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE invoice_number = 'FAC-200'))`);
      const { data } = await listBatches({ search: 'FAC-200' });
      expect(data[0]).toMatchObject({ status: 'DEPLETED', totalRemainingQuantity: 0, totalInitialQuantity: 4 });
    });

    it('un usuario sin rol de propietario debe indicar una sucursal suya', async () => {
      await expect(listBatches({ userId: cashierId, isOwner: false })).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(listBatches({ userId: cashierId, isOwner: false, branchId: secondBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      const own = await listBatches({ userId: cashierId, isOwner: false, branchId: shop.branchId });
      expect(own.meta.total).toBe(2);
    });

    it('nunca mezcla lotes de otra tienda', async () => {
      const foreignVariant = await seedVariant(db, other.tenantId, 'AJENO-1');
      await new RegisterPurchaseHandler(db.manager, redisStub).execute(
        new RegisterPurchaseCommand(other.tenantId, other.ownerId, other.supplierId, other.branchId, 'FAC-X', [{ variantId: foreignVariant, quantity: 1, purchasePrice: 1 }]),
      );
      expect((await listBatches()).data.every((b) => b.branchId === shop.branchId || b.branchId === secondBranchId)).toBe(true);
      const byVariant = new GetBatchesByVariantHandler(db.manager, redisStub);
      const foreign = await byVariant.execute(new GetBatchesByVariantQuery(shop.tenantId, foreignVariant, 1, 10, undefined, shop.ownerId, true));
      expect(foreign.data).toEqual([]);
    });

    it('los ítems de cada lote salen ordenados por SKU (orden natural: 2 antes que 10)', async () => {
      const v10 = await seedVariant(db, other.tenantId, 'ORD-10');
      const v2 = await seedVariant(db, other.tenantId, 'ORD-2');
      const v1 = await seedVariant(db, other.tenantId, 'ABC-1');
      await new RegisterPurchaseHandler(db.manager, redisStub).execute(
        new RegisterPurchaseCommand(other.tenantId, other.ownerId, other.supplierId, other.branchId, 'FAC-ORDEN', [
          { variantId: v10, quantity: 1, purchasePrice: 1 },
          { variantId: v2, quantity: 1, purchasePrice: 1 },
          { variantId: v1, quantity: 1, purchasePrice: 1 },
        ]),
      );

      const { data } = await new GetBatchesHandler(db.manager, redisStub).execute(
        new GetBatchesQuery(other.tenantId, other.branchId, undefined, undefined, 'FAC-ORDEN', 1, 10, other.ownerId, true),
      );

      expect(data[0].items.map((item) => item.sku)).toEqual(['ABC-1', 'ORD-2', 'ORD-10']);
    });

    it('los lotes de una variante muestran lo comprado y lo consumido', async () => {
      const result = await new GetBatchesByVariantHandler(db.manager, redisStub).execute(
        new GetBatchesByVariantQuery(shop.tenantId, variantId, 1, 10, shop.branchId, shop.ownerId, true),
      );
      expect(result.meta.total).toBe(2);
      const depleted = result.data.find((b) => b.status === BatchStatus.DEPLETED);
      expect(depleted).toMatchObject({ initialQuantity: 4, remainingQuantity: 0, consumedQuantity: 4, totalCostValue: 0 });
    });
  });
});
