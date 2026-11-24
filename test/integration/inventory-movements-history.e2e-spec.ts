import { DataSource } from 'typeorm';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { GetInventoryMovementsHandler } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.handler';
import { GetInventoryMovementsQuery } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.query';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { InventoryMovementType } from '../../src/common/enums/inventory-movement-type.enum';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Historial global de movimientos: filtros, paginación y qué sucursales ve cada usuario. */
describe('Historial global de movimientos de inventario', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let leiza: string;
  let norte: string;
  let cashierId: string;
  let camisa: string;
  let gorra: string;

  const history = (filters: Partial<GetInventoryMovementsQuery['filters']> = {}, who: { userId?: string; isOwner?: boolean; tenant?: SeededTenant } = {}) =>
    new GetInventoryMovementsHandler(db.manager, redisStub).execute(
      new GetInventoryMovementsQuery((who.tenant ?? shop).tenantId, who.userId ?? shop.ownerId, who.isOwner ?? true, { page: 1, limit: 50, startDate: '2020-01-01', endDate: '2100-01-01', ...filters }),
    );

  const move = (args: { variantId: string; type: InventoryMovementType; reason: string; quantity: number; origin?: string; destination?: string; tenant?: SeededTenant; at: string }) =>
    db.getRepository(InventoryMovement).save(
      db.getRepository(InventoryMovement).create({
        tenantId: (args.tenant ?? shop).tenantId,
        variantId: args.variantId,
        type: args.type,
        reason: args.reason,
        quantity: args.quantity,
        originBranchId: args.origin ?? null,
        destinationBranchId: args.destination ?? null,
        createdAt: new Date(args.at),
      }),
    );

  beforeAll(async () => {
    database = await startTestDatabase('inventory-history');
    db = database.db;
    shop = await seedTenant(db, 'historial');
    other = await seedTenant(db, 'historial-ajena');
    leiza = shop.branchId;
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    camisa = await seedVariant(db, shop.tenantId, 'CAMISA-M');
    gorra = await seedVariant(db, shop.tenantId, 'GORRA-N');
    const foreign = await seedVariant(db, other.tenantId, 'AJENO-1');

    await move({ variantId: camisa, type: InventoryMovementType.IN, reason: 'COMPRA', quantity: 10, destination: leiza, at: '2026-11-01T10:00:00Z' });
    await move({ variantId: camisa, type: InventoryMovementType.OUT, reason: 'VENTA', quantity: 2, origin: leiza, at: '2026-11-02T10:00:00Z' });
    await move({ variantId: gorra, type: InventoryMovementType.IN, reason: 'ADJUSTMENT', quantity: 5, destination: norte, at: '2026-11-03T10:00:00Z' });
    await move({ variantId: gorra, type: InventoryMovementType.OUT, reason: 'ADJUSTMENT', quantity: 1, origin: norte, at: '2026-11-04T10:00:00Z' });
    await move({ variantId: foreign, type: InventoryMovementType.IN, reason: 'COMPRA', quantity: 99, destination: other.branchId, tenant: other, at: '2026-11-02T10:00:00Z' });

    const cashier = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-hist', password: 'x', isOwner: false }));
    cashierId = cashier.id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, leiza]);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('lista todo lo del tenant, de lo más reciente a lo más antiguo, sin mezclar datos de otro tenant', async () => {
    const page = await history();

    expect(page.meta.total).toBe(4);
    expect(page.data.map((m) => m.quantity)).toEqual([1, 5, 2, 10]);
    expect(page.data.map((m) => m.sku)).not.toContain('AJENO-1');
  });

  it('devuelve producto, SKU y sucursales de cada movimiento', async () => {
    const [latest] = (await history()).data;

    expect(latest).toMatchObject({ sku: 'GORRA-N', type: 'OUT', reason: 'ADJUSTMENT', originBranch: { name: 'Norte' }, destinationBranch: null });
    expect(typeof latest.productName).toBe('string');
  });

  it('filtra por tipo, motivo, producto y texto', async () => {
    expect((await history({ type: InventoryMovementType.IN })).meta.total).toBe(2);
    expect((await history({ reason: 'VENTA' })).data.map((m) => m.quantity)).toEqual([2]);
    expect((await history({ variantId: gorra })).meta.total).toBe(2);
    expect((await history({ search: 'camisa' })).meta.total).toBe(2);
    expect((await history({ search: '%' })).meta.total).toBe(0); // el comodín se trata como texto
  });

  it('filtra por sucursal: cuenta lo que entra y lo que sale de ella', async () => {
    expect((await history({ branchId: norte })).data.map((m) => m.quantity)).toEqual([1, 5]);
    expect((await history({ branchId: leiza })).data.map((m) => m.quantity)).toEqual([2, 10]);
  });

  it('filtra por fechas', async () => {
    const page = await history({ startDate: '2026-11-02', endDate: '2026-11-03' });

    expect(page.data.map((m) => m.quantity)).toEqual([5, 2]);
  });

  it('pagina sin repetir ni perder filas', async () => {
    const first = await history({ limit: 3, page: 1 });
    const second = await history({ limit: 3, page: 2 });

    expect(first.meta).toEqual({ total: 4, page: 1, limit: 3, totalPages: 2 });
    expect([...first.data, ...second.data].map((m) => m.id)).toHaveLength(new Set([...first.data, ...second.data].map((m) => m.id)).size);
    expect(second.data).toHaveLength(1);
  });

  describe('usuario sin acceso a todas las sucursales', () => {
    const asCashier = { userId: '', isOwner: false };
    beforeEach(() => {
      asCashier.userId = cashierId;
    });

    it('sin indicar sucursal, ve solo los movimientos de las suyas', async () => {
      const page = await history({}, asCashier);

      expect(page.data.map((m) => m.quantity)).toEqual([2, 10]);
    });

    it('pedir una sucursal ajena se rechaza con 403', async () => {
      await expect(history({ branchId: norte }, asCashier)).rejects.toMatchObject({ status: 403 });
    });

    it('sin ninguna sucursal asignada no ve nada', async () => {
      await db.query(`DELETE FROM user_branches WHERE user_id = $1`, [cashierId]);
      const page = await history({}, asCashier);

      expect(page.data).toEqual([]);
      expect(page.meta.total).toBe(0);
    });
  });
});
