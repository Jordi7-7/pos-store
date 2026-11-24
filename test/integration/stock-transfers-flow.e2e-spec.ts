import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { CreateInventoryDocumentCommand } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { CreateStockTransferCommand } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.command';
import { CreateStockTransferHandler } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.handler';
import { GetInventoryMovementsHandler } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.handler';
import { GetInventoryMovementsQuery } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.query';
import { Batch } from '../../src/modules/batches/domain/entities/batch.entity';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { InventoryDocument } from '../../src/modules/products/domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../src/modules/products/domain/entities/product-batch.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { InventoryDocumentKind } from '../../src/common/enums/inventory-document-kind.enum';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Traslados entre sucursales: instantáneos, todo o nada, con el costo que sale del origen y acceso a las dos sucursales. */
describe('Traslados entre sucursales', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let matriz: string;
  let norte: string;
  let sur: string;
  let foreignBranch: string;
  let foreignVariant: string;
  let n = 0;

  type Extra = { reason?: string; comment?: string; clientRequestId?: string; userId?: string };
  const transfer = (from: string, to: string, lines: Array<{ variantId: string; quantity: number }>, extra: Extra = {}) =>
    new CreateStockTransferHandler(db.manager, redisStub).execute(
      new CreateStockTransferCommand(shop.tenantId, extra.userId ?? shop.ownerId, from, to, extra.reason ?? 'TRASLADO', lines, extra.comment, extra.clientRequestId),
    );
  /** Variante nueva con stock en una sucursal, entrado con un costo propio. */
  const variantAt = async (branchId: string, quantity: number, unitCost = 2) => {
    const id = await seedVariant(db, shop.tenantId, `TRS-${++n}`, { purchasePrice: 9 });
    if (quantity > 0) await new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: id, quantity, unitCost }]));
    return id;
  };
  const stock = async (variantId: string, branchId: string) => Number((await db.getRepository(ProductStock).findOneBy({ branchId, variantId }))?.quantity ?? 0);
  const totals = async () => ({
    documents: await db.getRepository(InventoryDocument).count({ where: { tenantId: shop.tenantId } }),
    movements: await db.getRepository(InventoryMovement).count({ where: { tenantId: shop.tenantId } }),
    batches: await db.getRepository(Batch).count({ where: { tenantId: shop.tenantId } }),
  });
  const newUser = async (name: string, branches: string[]) => {
    const user = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name, username: `trs-${name}`, password: 'x', isOwner: false }));
    for (const branchId of branches) await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [user.id, branchId]);
    return user.id;
  };

  beforeAll(async () => {
    database = await startTestDatabase('stock-transfers');
    db = database.db;
    shop = await seedTenant(db, 'traslados');
    other = await seedTenant(db, 'traslados-ajena');
    matriz = shop.branchId;
    const branch = (name: string, code: number) => db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name, address: 'x', code })).then((saved) => saved.id);
    norte = await branch('Norte', 2);
    sur = await branch('Sur', 3);
    foreignBranch = other.branchId;
    foreignVariant = await seedVariant(db, other.tenantId, 'TRS-AJENO');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('mueve varias líneas: baja en el origen, sube en el destino, y queda un documento TRS con sus dos sucursales', async () => {
    const a = await variantAt(matriz, 10);
    const b = await variantAt(matriz, 4);

    const doc = await transfer(matriz, norte, [{ variantId: a, quantity: 3 }, { variantId: b, quantity: 4 }], { comment: 'Para el fin de semana' });

    expect(doc).toMatchObject({ number: 'TRS-000001', kind: 'TRANSFER', reason: 'TRASLADO', comment: 'Para el fin de semana', branchId: matriz, destinationBranchId: norte });
    expect(doc.lines.map((l) => [l.quantity, l.type]).sort()).toEqual([[3, 'OUT'], [4, 'OUT']]);
    expect([await stock(a, matriz), await stock(a, norte), await stock(b, matriz), await stock(b, norte)]).toEqual([7, 3, 0, 4]);
    const saved = await db.getRepository(InventoryDocument).findOneByOrFail({ id: doc.id });
    expect(saved).toMatchObject({ branchId: matriz, destinationBranchId: norte, userId: shop.ownerId });
  });

  it('en el kardex son dos movimientos por línea: salida del origen y entrada al destino, cada uno en su sucursal', async () => {
    const v = await variantAt(matriz, 5);

    const doc = await transfer(matriz, sur, [{ variantId: v, quantity: 2 }]);

    const movements = await db.getRepository(InventoryMovement).find({ where: { documentId: doc.id } });
    expect(movements.map((m) => [m.type, m.originBranchId, m.destinationBranchId, m.reason, Number(m.quantity)]).sort()).toEqual(
      [['OUT', matriz, null, 'TRASLADO', 2], ['IN', null, sur, 'TRASLADO', 2]].sort(),
    );
  });

  it('el costo sale con la mercancía: el lote del destino vale lo mismo que lo consumido en el origen (FIFO)', async () => {
    const v = await variantAt(matriz, 5, 1);
    await new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, matriz, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: v, quantity: 5, unitCost: 2 }]));

    const doc = await transfer(matriz, norte, [{ variantId: v, quantity: 7 }]); // 5 a $1 + 2 a $2 = $9

    const origin = await db.getRepository(ProductBatch).find({ where: { variantId: v, branchId: matriz }, order: { createdAt: 'ASC' } });
    expect(origin.map((l) => Number(l.remainingQuantity))).toEqual([0, 3]);
    const header = await db.getRepository(Batch).findOneByOrFail({ documentId: doc.id });
    expect(header).toMatchObject({ originType: 'TRANSFER', branchId: norte, code: doc.number });
    const received = await db.getRepository(ProductBatch).findOneByOrFail({ batchId: header.id });
    expect(Number(received.unitCost) * 7).toBeCloseTo(9, 1);
    expect(Number(received.initialQuantity)).toBe(7);
  });

  it('un traslado de una variante que ya tenía stock en el destino suma, sin pisar lo que había', async () => {
    const v = await variantAt(matriz, 6);
    await variantAt(norte, 0);
    await transfer(matriz, norte, [{ variantId: v, quantity: 1 }]);

    await transfer(matriz, norte, [{ variantId: v, quantity: 2 }]);

    expect(await stock(v, norte)).toBe(3);
    expect(await stock(v, matriz)).toBe(3);
  });

  it('la misma variante repetida se junta en una línea', async () => {
    const v = await variantAt(matriz, 10);

    const doc = await transfer(matriz, norte, [{ variantId: v, quantity: 1 }, { variantId: v, quantity: 2 }]);

    expect(doc.lines).toHaveLength(1);
    expect(await stock(v, norte)).toBe(3);
  });

  describe('todo o nada', () => {
    it('una línea sin stock suficiente en el origen rechaza el traslado entero y dice cuáles fallaron', async () => {
      const ok = await variantAt(matriz, 5);
      const empty = await variantAt(matriz, 0);
      const before = await totals();

      await expect(transfer(matriz, norte, [{ variantId: ok, quantity: 2 }, { variantId: empty, quantity: 1 }])).rejects.toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        status: 409,
        details: { branchId: matriz, lines: [{ variantId: empty, available: 0, requested: 1 }] },
      });

      expect([await stock(ok, matriz), await stock(ok, norte)]).toEqual([5, 0]);
      expect(await totals()).toEqual(before);
    });

    it('trasladar desde donde el stock es negativo o cero no se puede', async () => {
      const v = await seedVariant(db, shop.tenantId, `TRS-NEG-${++n}`);
      await db.getRepository(ProductStock).save(db.getRepository(ProductStock).create({ branchId: matriz, variantId: v, quantity: -2 }));

      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 1 }])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });
  });

  describe('validaciones', () => {
    it('el origen y el destino deben ser distintos', async () => {
      const v = await variantAt(matriz, 5);

      await expect(transfer(matriz, matriz, [{ variantId: v, quantity: 1 }])).rejects.toMatchObject({ code: 'SAME_BRANCH_TRANSFER', status: 400 });
      expect(await stock(v, matriz)).toBe(5);
    });

    it('una sucursal de otra tienda o inexistente no existe', async () => {
      const v = await variantAt(matriz, 5);

      await expect(transfer(matriz, foreignBranch, [{ variantId: v, quantity: 1 }])).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND', details: { branchId: foreignBranch } });
      await expect(transfer(randomUUID(), norte, [{ variantId: v, quantity: 1 }])).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
    });

    it('una variante de otra tienda rechaza todo sin guardar nada', async () => {
      const v = await variantAt(matriz, 5);
      const before = await totals();

      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 1 }, { variantId: foreignVariant, quantity: 1 }])).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });

      expect(await totals()).toEqual(before);
      expect(await stock(v, matriz)).toBe(5);
    });

    it('rechaza motivos que no son de traslado, vacío, cantidades no positivas y demasiadas líneas', async () => {
      const v = await variantAt(matriz, 5);

      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 1 }], { reason: 'MERMA' })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 1 }], { reason: 'ADJUSTMENT' })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
      await expect(transfer(matriz, norte, [])).rejects.toMatchObject({ code: 'EMPTY_INVENTORY_DOCUMENT' });
      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 0 }])).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
      await expect(transfer(matriz, norte, Array.from({ length: 201 }, () => ({ variantId: randomUUID(), quantity: 1 })))).rejects.toMatchObject({ code: 'INVENTORY_DOCUMENT_TOO_LARGE' });
    });

    it('una entrada o salida manual no acepta el tipo traslado', async () => {
      const v = await variantAt(matriz, 5);

      await expect(
        new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, matriz, InventoryDocumentKind.TRANSFER, 'TRASLADO', [{ variantId: v, quantity: 1 }])),
      ).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
    });
  });

  describe('acceso: hacen falta las dos sucursales', () => {
    it('con acceso a origen y destino puede', async () => {
      const v = await variantAt(matriz, 5);
      const both = await newUser('ambas', [matriz, norte]);

      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 1 }], { userId: both })).resolves.toMatchObject({ kind: 'TRANSFER' });
    });

    it('sin acceso al destino, 403 y no se mueve nada', async () => {
      const v = await variantAt(matriz, 5);
      const onlyOrigin = await newUser('solo-origen', [matriz]);

      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 1 }], { userId: onlyOrigin })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
      expect(await stock(v, matriz)).toBe(5);
    });

    it('sin acceso al origen, 403 (no puede sacar de una sucursal que no es suya)', async () => {
      const v = await variantAt(matriz, 5);
      const onlyDestination = await newUser('solo-destino', [norte]);

      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 1 }], { userId: onlyDestination })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
      expect(await stock(v, matriz)).toBe(5);
    });
  });

  describe('concurrencia', () => {
    it('traslados opuestos simultáneos (A→B y B→A) de las mismas variantes terminan todos y conservan el total', async () => {
      const a = await variantAt(matriz, 50);
      const b = await variantAt(matriz, 50);
      await transfer(matriz, norte, [{ variantId: a, quantity: 25 }, { variantId: b, quantity: 25 }]);

      for (let round = 0; round < 12; round++) {
        await Promise.all([
          transfer(matriz, norte, [{ variantId: a, quantity: 1 }, { variantId: b, quantity: 1 }]),
          transfer(norte, matriz, [{ variantId: b, quantity: 1 }, { variantId: a, quantity: 1 }]),
          transfer(matriz, norte, [{ variantId: b, quantity: 1 }, { variantId: a, quantity: 1 }]),
          transfer(norte, matriz, [{ variantId: a, quantity: 1 }, { variantId: b, quantity: 1 }]),
        ]);
      }

      for (const v of [a, b]) expect((await stock(v, matriz)) + (await stock(v, norte))).toBe(50);
    });

    it('dos traslados simultáneos que juntos superan el stock: solo uno se registra', async () => {
      const v = await variantAt(matriz, 5);

      const results = await Promise.allSettled([transfer(matriz, norte, [{ variantId: v, quantity: 3 }]), transfer(matriz, sur, [{ variantId: v, quantity: 3 }])]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await stock(v, matriz)).toBe(2);
    });

    it('un traslado y una salida manual simultáneos del mismo producto no se pisan', async () => {
      const v = await variantAt(matriz, 10);

      await Promise.all([
        transfer(matriz, norte, [{ variantId: v, quantity: 4 }]),
        new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, matriz, InventoryDocumentKind.EXIT, 'MERMA', [{ variantId: v, quantity: 3 }], 'Salida de prueba')),
      ]);

      expect(await stock(v, matriz)).toBe(3);
      expect(await stock(v, norte)).toBe(4);
    });
  });

  describe('idempotencia', () => {
    it('reenviar el mismo traslado con su identificador devuelve el mismo y no lo repite', async () => {
      const v = await variantAt(matriz, 10);
      const key = randomUUID();

      const first = await transfer(matriz, norte, [{ variantId: v, quantity: 4 }], { clientRequestId: key });
      const second = await transfer(matriz, norte, [{ variantId: v, quantity: 4 }], { clientRequestId: key });

      expect(second.id).toBe(first.id);
      expect(second.lines).toEqual(first.lines);
      expect(await stock(v, norte)).toBe(4);
    });

    it('el mismo identificador para otro traslado distinto (otra cantidad o destino) se rechaza', async () => {
      const v = await variantAt(matriz, 10);
      const key = randomUUID();
      await transfer(matriz, norte, [{ variantId: v, quantity: 4 }], { clientRequestId: key });

      await expect(transfer(matriz, norte, [{ variantId: v, quantity: 5 }], { clientRequestId: key })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      await expect(transfer(matriz, sur, [{ variantId: v, quantity: 4 }], { clientRequestId: key })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(await stock(v, norte)).toBe(4);
    });

    it('reintentos simultáneos con el mismo identificador dejan un solo traslado', async () => {
      for (let round = 0; round < 6; round++) {
        const v = await variantAt(matriz, 10);
        const key = randomUUID();

        const results = await Promise.all([1, 2, 3].map(() => transfer(matriz, norte, [{ variantId: v, quantity: 10 }], { clientRequestId: key })));

        expect(new Set(results.map((r) => r.id)).size).toBe(1);
        expect(await stock(v, matriz)).toBe(0);
        expect(await stock(v, norte)).toBe(10);
      }
    });
  });

  it('el historial muestra la salida y la entrada de un traslado con la otra sucursal', async () => {
    const v = await variantAt(matriz, 5);
    await transfer(matriz, sur, [{ variantId: v, quantity: 2 }]);

    const page = await new GetInventoryMovementsHandler(db.manager, redisStub).execute(
      new GetInventoryMovementsQuery(shop.tenantId, shop.ownerId, true, { page: 1, limit: 20, variantId: v, reason: 'TRASLADO', startDate: '2020-01-01', endDate: '2100-01-01' }),
    );

    const byType = Object.fromEntries(page.data.map((m) => [m.type, m]));
    expect(byType.OUT).toMatchObject({ originBranch: { name: 'Matriz' }, destinationBranch: null, document: { kind: 'TRANSFER', counterpartBranchName: 'Sur' } });
    expect(byType.IN).toMatchObject({ originBranch: null, destinationBranch: { name: 'Sur' }, document: { kind: 'TRANSFER', counterpartBranchName: 'Matriz' } });
  });
});
