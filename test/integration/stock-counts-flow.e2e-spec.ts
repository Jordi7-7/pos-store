import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { CreateInventoryDocumentCommand } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { CreateStockCountCommand } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.command';
import { CreateStockCountHandler } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.handler';
import { Batch } from '../../src/modules/batches/domain/entities/batch.entity';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { InventoryDocument } from '../../src/modules/products/domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../src/modules/products/domain/entities/product-batch.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { CountLine } from '../../src/modules/products/domain/services/stock-count-rules';
import { InventoryDocumentKind } from '../../src/common/enums/inventory-document-kind.enum';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Conteo físico: la diferencia contada se aplica sobre el stock de ahora, todo o nada, con aviso si el stock cambió. */
describe('Conteo físico de inventario', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let norte: string;
  let cashierId: string;
  let foreign: string;
  let n = 0;

  type Extra = { reason?: string; comment?: string; branchId?: string; clientRequestId?: string; acceptStockChanges?: boolean; userId?: string };
  const count = (lines: CountLine[], extra: Extra = {}) =>
    new CreateStockCountHandler(db.manager, redisStub).execute(
      new CreateStockCountCommand(shop.tenantId, extra.userId ?? shop.ownerId, extra.branchId ?? shop.branchId, extra.reason ?? 'CONTEO_FISICO', lines, extra.comment, extra.clientRequestId, extra.acceptStockChanges ?? false),
    );
  /** Variante nueva con stock inicial entrado a mano (con costo propio). */
  const variantWith = async (quantity: number, unitCost = 2) => {
    const id = await seedVariant(db, shop.tenantId, `CNT-${++n}`, { purchasePrice: 5 });
    if (quantity > 0) await new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: id, quantity, unitCost }]));
    return id;
  };
  const setStock = async (variantId: string, quantity: number, branchId = shop.branchId) => {
    const repo = db.getRepository(ProductStock);
    const existing = await repo.findOneBy({ branchId, variantId });
    await repo.save(existing ? Object.assign(existing, { quantity }) : repo.create({ branchId, variantId, quantity }));
  };
  const stock = async (variantId: string, branchId = shop.branchId) => Number((await db.getRepository(ProductStock).findOneBy({ branchId, variantId }))?.quantity ?? 0);
  const totals = async () => ({
    documents: await db.getRepository(InventoryDocument).count({ where: { tenantId: shop.tenantId } }),
    movements: await db.getRepository(InventoryMovement).count({ where: { tenantId: shop.tenantId } }),
    batches: await db.getRepository(Batch).count({ where: { tenantId: shop.tenantId } }),
  });

  beforeAll(async () => {
    database = await startTestDatabase('stock-counts');
    db = database.db;
    shop = await seedTenant(db, 'conteos');
    other = await seedTenant(db, 'conteos-ajena');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    foreign = await seedVariant(db, other.tenantId, 'CNT-AJENO');
    const cashier = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-cnt', password: 'x', isOwner: false }));
    cashierId = cashier.id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('contar de menos resta, contar de más suma, contar igual no genera movimiento; todo en un documento CNT', async () => {
    const falta = await variantWith(12);
    const sobra = await variantWith(5);
    const igual = await variantWith(3);

    const doc = await count(
      [{ variantId: falta, counted: 10, expected: 12 }, { variantId: sobra, counted: 7, expected: 5 }, { variantId: igual, counted: 3, expected: 3 }],
      { comment: 'Inventario de noviembre' },
    );

    expect(doc).toMatchObject({ number: 'CNT-000001', kind: 'COUNT', reason: 'CONTEO_FISICO', comment: 'Inventario de noviembre' });
    expect(doc.lines.map((l) => [l.sku, l.quantity, l.type]).sort()).toEqual([[`CNT-${n - 2}`, 2, 'OUT'], [`CNT-${n - 1}`, 2, 'IN']].sort());
    expect([await stock(falta), await stock(sobra), await stock(igual)]).toEqual([10, 7, 3]);
    const movements = await db.getRepository(InventoryMovement).find({ where: { documentId: doc.id } });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.reason === 'CONTEO_FISICO')).toBe(true);
  });

  it('lo que sobra entra como un lote del documento y lo que falta sale por FIFO', async () => {
    const v = await variantWith(5, 1);
    await new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: v, quantity: 5, unitCost: 2 }]));

    await count([{ variantId: v, counted: 8, expected: 10 }]); // faltan 2: salen del lote más antiguo
    const sobra = await variantWith(0);
    const doc = await count([{ variantId: sobra, counted: 4, expected: 0, unitCost: 3.5 }]);

    const layers = await db.getRepository(ProductBatch).find({ where: { variantId: v }, order: { createdAt: 'ASC' } });
    expect(layers.map((l) => Number(l.remainingQuantity))).toEqual([3, 5]);
    const header = await db.getRepository(Batch).findOneByOrFail({ documentId: doc.id });
    const layer = await db.getRepository(ProductBatch).findOneByOrFail({ batchId: header.id });
    expect(Number(layer.unitCost)).toBe(3.5);
  });

  it('un stock negativo (por ventas) se corrige con el conteo', async () => {
    const v = await variantWith(0);
    await setStock(v, -2);

    await count([{ variantId: v, counted: 3, expected: -2 }]);

    expect(await stock(v)).toBe(3);
  });

  describe('stock que cambió mientras se contaba', () => {
    it('pide confirmación (409) y no toca nada; al confirmar aplica la diferencia sobre el stock de ahora', async () => {
      const v = await variantWith(12);
      await setStock(v, 11); // se vendió 1 desde que el usuario vio 12
      const before = await totals();

      await expect(count([{ variantId: v, counted: 10, expected: 12 }])).rejects.toMatchObject({
        code: 'STOCK_CHANGED_SINCE_COUNT',
        status: 409,
        details: { branchId: shop.branchId, lines: [{ variantId: v, expected: 12, current: 11 }] },
      });
      expect(await stock(v)).toBe(11);
      expect(await totals()).toEqual(before);

      await count([{ variantId: v, counted: 10, expected: 12 }], { acceptStockChanges: true });

      // contó 10 de 12 que veía (−2) y ya se había vendido 1: quedan 9, no 10
      expect(await stock(v)).toBe(9);
    });

    it('si restar la diferencia dejaría el stock en negativo, se rechaza aunque se confirme', async () => {
      const v = await variantWith(5);
      await setStock(v, 3);

      await expect(count([{ variantId: v, counted: 1, expected: 5 }], { acceptStockChanges: true })).rejects.toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: { lines: [{ variantId: v, available: 3, requested: 4 }] },
      });
      expect(await stock(v)).toBe(3);
    });

    it('una línea sin diferencia no obliga a confirmar aunque su stock se haya movido', async () => {
      const v = await variantWith(5);
      const w = await variantWith(8);
      await setStock(v, 4);

      await expect(count([{ variantId: v, counted: 5, expected: 5 }, { variantId: w, counted: 6, expected: 8 }])).resolves.toMatchObject({ kind: 'COUNT' });
    });
  });

  describe('todo o nada y validaciones', () => {
    it('un conteo sin ninguna diferencia no se registra', async () => {
      const v = await variantWith(4);
      const before = await totals();

      await expect(count([{ variantId: v, counted: 4, expected: 4 }])).rejects.toMatchObject({ code: 'COUNT_WITHOUT_DIFFERENCES', status: 400 });
      expect(await totals()).toEqual(before);
    });

    it('una línea que no se puede rechaza todo el conteo', async () => {
      const ok = await variantWith(5);
      const before = await totals();

      await expect(count([{ variantId: ok, counted: 2, expected: 5 }, { variantId: foreign, counted: 1, expected: 0 }])).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
      await expect(count([{ variantId: ok, counted: 2, expected: 5 }, { variantId: randomUUID(), counted: 1, expected: 0 }])).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });

      expect(await stock(ok)).toBe(5);
      expect(await totals()).toEqual(before);
    });

    it('rechaza motivos que no son de conteo, vacío, negativos, repetidos y demasiadas líneas', async () => {
      const v = await variantWith(5);

      await expect(count([{ variantId: v, counted: 1, expected: 5 }], { reason: 'MERMA' })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
      await expect(count([{ variantId: v, counted: 1, expected: 5 }], { reason: 'ADJUSTMENT' })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
      await expect(count([])).rejects.toMatchObject({ code: 'EMPTY_INVENTORY_DOCUMENT' });
      await expect(count([{ variantId: v, counted: -1, expected: 5 }])).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
      await expect(count([{ variantId: v, counted: 1, expected: 5 }, { variantId: v, counted: 2, expected: 5 }])).rejects.toMatchObject({ code: 'DUPLICATE_COUNT_LINE', details: { variantIds: [v] } });
      await expect(count(Array.from({ length: 201 }, () => ({ variantId: randomUUID(), counted: 1, expected: 0 })))).rejects.toMatchObject({ code: 'INVENTORY_DOCUMENT_TOO_LARGE' });
    });

    it('la entrada o salida manual no acepta el tipo conteo ni sus motivos', async () => {
      const v = await variantWith(5);

      await expect(
        new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.COUNT, 'CONTEO_FISICO', [{ variantId: v, quantity: 1 }])),
      ).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
    });
  });

  describe('concurrencia', () => {
    it('dos conteos simultáneos de la misma variante no se pisan: el segundo ve que el stock cambió', async () => {
      const v = await variantWith(10);

      const results = await Promise.allSettled([count([{ variantId: v, counted: 8, expected: 10 }]), count([{ variantId: v, counted: 8, expected: 10 }])]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await stock(v)).toBe(8);
    });

    it('un conteo y una salida simultáneos con líneas cruzadas no se bloquean entre sí', async () => {
      const a = await variantWith(10);
      const b = await variantWith(10);

      const [counted, left] = await Promise.all([
        count([{ variantId: a, counted: 9, expected: 10 }, { variantId: b, counted: 9, expected: 10 }]),
        new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.EXIT, 'MERMA', [{ variantId: b, quantity: 1 }, { variantId: a, quantity: 1 }], 'Salida de prueba')),
      ]);

      expect(counted.number).toMatch(/^CNT-/);
      expect(left.number).toMatch(/^SAL-/);
    });
  });

  describe('acceso e idempotencia', () => {
    it('sin acceso a la sucursal: 403', async () => {
      const v = await variantWith(5, 2);
      await setStock(v, 5, norte);

      await expect(count([{ variantId: v, counted: 1, expected: 5 }], { branchId: norte, userId: cashierId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
    });

    it('reenviar el mismo conteo con su identificador devuelve el mismo y no lo repite', async () => {
      const v = await variantWith(10);
      const key = randomUUID();
      const lines = [{ variantId: v, counted: 7, expected: 10 }];

      const first = await count(lines, { clientRequestId: key });
      const second = await count(lines, { clientRequestId: key });

      expect(second.id).toBe(first.id);
      expect(second.lines).toEqual(first.lines);
      expect(await stock(v)).toBe(7);
    });

    it('el mismo identificador para otro conteo distinto se rechaza', async () => {
      const v = await variantWith(10);
      const key = randomUUID();
      await count([{ variantId: v, counted: 7, expected: 10 }], { clientRequestId: key });

      await expect(count([{ variantId: v, counted: 6, expected: 10 }], { clientRequestId: key })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(await stock(v)).toBe(7);
    });

    it('dos reintentos simultáneos con el mismo identificador dejan un solo conteo', async () => {
      for (let round = 0; round < 8; round++) {
        const v = await variantWith(10);
        const key = randomUUID();
        const lines = [{ variantId: v, counted: 7, expected: 10 }];

        const results = await Promise.all([1, 2, 3].map(() => count(lines, { clientRequestId: key })));

        expect(new Set(results.map((r) => r.id)).size).toBe(1);
        expect(await stock(v)).toBe(7);
      }
    });
  });
});
