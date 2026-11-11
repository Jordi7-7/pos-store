import { DataSource } from 'typeorm';
import { GetPosStockHandler } from '../../src/modules/products/application/queries/get-pos-stock/get-pos-stock.handler';
import { GetPosStockQuery } from '../../src/modules/products/application/queries/get-pos-stock/get-pos-stock.query';
import { PosStockItem } from '../../src/modules/products/application/read-models/pos-stock';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Existencias por sucursal para vender sin conexión: cada sucursal tiene su propio stock por variante. */
describe('Existencias del POS por sucursal', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let leiza: string;
  let norte: string;
  let cashierId: string;
  const variants: Record<string, string> = {};

  const stocks = (branchId: string, args: { after?: string; limit?: number; userId?: string; isOwner?: boolean; tenant?: SeededTenant } = {}) =>
    new GetPosStockHandler(db.manager, redisStub).execute(
      new GetPosStockQuery((args.tenant ?? shop).tenantId, branchId, args.userId ?? shop.ownerId, args.isOwner ?? true, args.after, args.limit),
    );

  /** Baja todo lo que haya desde `after`, página a página, como lo hace el aparato. */
  const download = async (branchId: string, after?: string, limit = 2) => {
    const items: PosStockItem[] = [];
    let cursor = after;
    let pages = 0;
    for (;;) {
      const page = await stocks(branchId, { after: cursor, limit });
      pages += 1;
      items.push(...page.items);
      cursor = page.cursor ?? cursor;
      if (!page.hasMore) return { items, cursor: cursor ?? null, pages };
      if (pages > 50) throw new Error('la descarga no termina');
    }
  };
  const bySku = (items: PosStockItem[]) => Object.fromEntries(items.map((i) => [Object.keys(variants).find((sku) => variants[sku] === i.variantId) ?? i.variantId, i.quantity]));
  /** Crea o cambia el stock de una variante en una sucursal (como lo hace una venta o un ajuste: guardando la fila). */
  const setStock = async (branchId: string, sku: string, quantity: number) => {
    const repo = db.getRepository(ProductStock);
    const existing = await repo.findOneBy({ branchId, variantId: variants[sku] });
    await repo.save(existing ? Object.assign(existing, { quantity }) : repo.create({ branchId, variantId: variants[sku], quantity }));
  };

  beforeAll(async () => {
    database = await startTestDatabase('pos-stock');
    db = database.db;
    shop = await seedTenant(db, 'stock');
    other = await seedTenant(db, 'stock-ajena');
    leiza = shop.branchId;
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    for (const sku of ['ST-1', 'ST-2', 'ST-3', 'ST-4']) variants[sku] = await seedVariant(db, shop.tenantId, sku);
    // Cada sucursal tiene su propio stock; uno es negativo (las ventas no se rechazan por stock)
    await setStock(leiza, 'ST-1', 10);
    await setStock(leiza, 'ST-2', 5);
    await setStock(leiza, 'ST-3', -2);
    await setStock(norte, 'ST-1', 3);
    await setStock(norte, 'ST-4', 7);
    const foreignVariant = await seedVariant(db, other.tenantId, 'AJENO-ST');
    await db.getRepository(ProductStock).save({ branchId: other.branchId, variantId: foreignVariant, quantity: 99 });
    const cashier = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-stock', password: 'x', isOwner: false }));
    cashierId = cashier.id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, leiza]);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('baja solo el stock de la sucursal pedida, con sus propias cantidades (también negativas)', async () => {
    expect(bySku((await download(leiza, undefined, 100)).items)).toEqual({ 'ST-1': 10, 'ST-2': 5, 'ST-3': -2 });
    expect(bySku((await download(norte, undefined, 100)).items)).toEqual({ 'ST-1': 3, 'ST-4': 7 });
  });

  it('la misma variante tiene cantidades distintas en cada sucursal', async () => {
    const [a, b] = [bySku((await download(leiza)).items), bySku((await download(norte)).items)];

    expect([a['ST-1'], b['ST-1']]).toEqual([10, 3]);
  });

  it('pagina sin repetir ni perder filas', async () => {
    const { items, pages } = await download(leiza, undefined, 1);

    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => i.variantId)).size).toBe(3);
    // con 3 filas y páginas de 1 hace falta una cuarta, vacía, para saber que no hay más
    expect(pages).toBe(4);
  });

  it('por cambios: solo llega lo que cambió desde el cursor, y un cambio de stock lo actualiza', async () => {
    const first = await download(leiza, undefined, 100);
    expect((await stocks(leiza, { after: first.cursor as string })).items).toEqual([]);

    await setStock(leiza, 'ST-2', 4);
    const delta = await download(leiza, first.cursor as string, 100);

    expect(bySku(delta.items)).toEqual({ 'ST-2': 4 });
    // la otra sucursal no se entera
    expect((await stocks(norte, { after: (await download(norte, undefined, 100)).cursor as string })).items).toEqual([]);
  });

  it('nunca devuelve stock de variantes o sucursales de otra tienda', async () => {
    expect((await stocks(other.branchId)).items).toEqual([]);
    expect((await stocks(leiza, { limit: 100 })).items.every((i) => Object.values(variants).includes(i.variantId))).toBe(true);
  });

  it('un cajero solo puede pedir las sucursales que tiene asignadas', async () => {
    await expect(stocks(norte, { userId: cashierId, isOwner: false })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    expect((await stocks(leiza, { userId: cashierId, isOwner: false, limit: 100 })).items).toHaveLength(3);
  });

  it('un cursor con formato inválido se trata como primera descarga', async () => {
    expect((await stocks(leiza, { after: 'cursor-roto', limit: 100 })).items).toHaveLength(3);
  });
});
