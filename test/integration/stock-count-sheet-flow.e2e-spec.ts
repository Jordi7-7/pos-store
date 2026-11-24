import { DataSource } from 'typeorm';
import { GetStockCountSheetHandler } from '../../src/modules/products/application/queries/get-stock-count-sheet/get-stock-count-sheet.handler';
import { GetStockCountSheetQuery } from '../../src/modules/products/application/queries/get-stock-count-sheet/get-stock-count-sheet.query';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { Category } from '../../src/modules/products/domain/entities/category.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Lista de variantes de una sucursal para armar un conteo: paginada por SKU, con filtros y acceso por sucursal. */
describe('Lista de productos para el conteo físico', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let norte: string;
  let ropa: string;
  let cashierId: string;
  const ids: Record<string, string> = {};

  type Filters = Partial<GetStockCountSheetQuery['filters']>;
  const sheet = (filters: Filters = {}, who: { branchId?: string; userId?: string; isOwner?: boolean } = {}) =>
    new GetStockCountSheetHandler(db.manager, redisStub).execute(
      new GetStockCountSheetQuery(shop.tenantId, who.userId ?? shop.ownerId, who.isOwner ?? true, who.branchId ?? shop.branchId, { limit: 100, ...filters }),
    );
  const skus = async (filters: Filters = {}, who = {}) => (await sheet(filters, who)).items.map((item) => item.sku);
  const setStock = (sku: string, quantity: number, branchId = shop.branchId) => db.getRepository(ProductStock).save(db.getRepository(ProductStock).create({ branchId, variantId: ids[sku], quantity }));

  beforeAll(async () => {
    database = await startTestDatabase('count-sheet');
    db = database.db;
    shop = await seedTenant(db, 'planilla');
    other = await seedTenant(db, 'planilla-ajena');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    ropa = (await db.getRepository(Category).save(db.getRepository(Category).create({ tenantId: shop.tenantId, name: 'Ropa' }))).id;
    for (const sku of ['SH-A', 'SH-B', 'SH-C', 'SH-D', 'SH-E', 'SH-F']) ids[sku] = await seedVariant(db, shop.tenantId, sku, { purchasePrice: 7 });
    await db.query(`UPDATE products SET category_id = $1 WHERE id IN (SELECT product_id FROM product_variants WHERE sku IN ('SH-A','SH-B','SH-C'))`, [ropa]);
    await setStock('SH-A', 10);
    await setStock('SH-B', 0);
    await setStock('SH-C', -3); // saldo negativo por ventas: también hay que contarlo
    await setStock('SH-E', 4);
    await setStock('SH-A', 99, norte); // otra sucursal: no debe mezclarse
    // SH-D y SH-F no tienen fila de stock en la sucursal (cuenta como 0)
    await seedVariant(db, other.tenantId, 'SH-AJENO');
    const cashier = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-sheet', password: 'x', isOwner: false }));
    cashierId = cashier.id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('lista las variantes de la tienda por SKU con la existencia de ESA sucursal (0 si no tienen fila), sin datos de otra tienda', async () => {
    const { items } = await sheet();

    expect(items.map((i) => [i.sku, i.stock])).toEqual([['SH-A', 10], ['SH-B', 0], ['SH-C', -3], ['SH-D', 0], ['SH-E', 4], ['SH-F', 0]]);
    expect(items[0]).toMatchObject({ variantId: ids['SH-A'], productName: 'SH-A', purchasePrice: 7 });
  });

  it('cada sucursal muestra su propia existencia', async () => {
    expect((await sheet({}, { branchId: norte })).items.find((i) => i.sku === 'SH-A')?.stock).toBe(99);
  });

  it('"solo con existencias" deja los que tienen algo, incluidos los saldos negativos, y quita los de 0 y sin fila', async () => {
    expect(await skus({ onlyWithStock: true })).toEqual(['SH-A', 'SH-C', 'SH-E']);
  });

  it('filtra por categoría y se combina con "solo con existencias"', async () => {
    expect(await skus({ categoryId: ropa })).toEqual(['SH-A', 'SH-B', 'SH-C']);
    expect(await skus({ categoryId: ropa, onlyWithStock: true })).toEqual(['SH-A', 'SH-C']);
  });

  it('pagina por SKU sin repetir ni perder filas, y avisa cuando no hay más', async () => {
    const seen: string[] = [];
    let after: string | undefined;
    let pages = 0;
    do {
      const page = await sheet({ limit: 4, after });
      seen.push(...page.items.map((i) => i.sku));
      after = page.nextAfter ?? undefined;
      pages += 1;
    } while (after && pages < 10);

    expect(seen).toEqual(['SH-A', 'SH-B', 'SH-C', 'SH-D', 'SH-E', 'SH-F']);
    expect(pages).toBe(2);
  });

  it('una página exacta no inventa una página siguiente', async () => {
    expect((await sheet({ limit: 6 })).nextAfter).toBeNull();
    expect((await sheet({ limit: 5 })).nextAfter).toBe('SH-E');
  });

  it('los productos borrados no aparecen', async () => {
    const gone = await seedVariant(db, shop.tenantId, 'SH-BORRADA');
    await db.getRepository(ProductVariant).softDelete({ id: gone });

    expect(await skus()).not.toContain('SH-BORRADA');
  });

  describe('acceso por sucursal', () => {
    it('un usuario puede consultar su sucursal', async () => {
      expect(await skus({ onlyWithStock: true }, { userId: cashierId, isOwner: false })).toEqual(['SH-A', 'SH-C', 'SH-E']);
    });

    it('una sucursal que no es suya: 403', async () => {
      await expect(sheet({}, { branchId: norte, userId: cashierId, isOwner: false })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
    });
  });
});
