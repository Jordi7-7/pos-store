import { DataSource } from 'typeorm';
import { CreateInventoryDocumentCommand } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { GetInventoryMovementsHandler } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.handler';
import { GetInventoryMovementsQuery } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.query';
import { Batch } from '../../src/modules/batches/domain/entities/batch.entity';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { InventoryDocument } from '../../src/modules/products/domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../src/modules/products/domain/entities/product-batch.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { DocumentLine } from '../../src/modules/products/domain/services/inventory-document-rules';
import { InventoryDocumentKind } from '../../src/common/enums/inventory-document-kind.enum';
import { InventoryMovementType } from '../../src/common/enums/inventory-movement-type.enum';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';
import { randomUUID } from 'crypto';

/** Entradas y salidas manuales con varias líneas: todo o nada, FIFO, idempotencia, concurrencia y acceso. */
describe('Documentos de inventario (entrada/salida manual)', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let norte: string;
  let cashierId: string;
  let camisa: string;
  let gorra: string;
  let jean: string;
  let foreign: string;

  const handler = () => new CreateInventoryDocumentHandler(db.manager, redisStub);
  const post = (args: { kind: InventoryDocumentKind; reason: string; lines: DocumentLine[]; branchId?: string; userId?: string; comment?: string; clientRequestId?: string; tenant?: SeededTenant }) =>
    handler().execute(
      new CreateInventoryDocumentCommand((args.tenant ?? shop).tenantId, args.userId ?? shop.ownerId, args.branchId ?? shop.branchId, args.kind, args.reason, args.lines, args.comment, args.clientRequestId),
    );
  const enter = (lines: DocumentLine[], extra: { reason?: string; comment?: string; branchId?: string; clientRequestId?: string } = {}) =>
    post({ kind: InventoryDocumentKind.ENTRY, reason: extra.reason ?? 'DONACION', lines, ...extra });
  const leave = (lines: DocumentLine[], extra: { reason?: string; comment?: string; branchId?: string; clientRequestId?: string; userId?: string } = {}) =>
    post({ kind: InventoryDocumentKind.EXIT, reason: extra.reason ?? 'MERMA', lines, comment: 'Salida de prueba', ...extra });
  const stock = async (variantId: string, branchId = shop.branchId) => Number((await db.getRepository(ProductStock).findOneBy({ branchId, variantId }))?.quantity ?? 0);
  const counts = async () => ({
    documents: await db.getRepository(InventoryDocument).count({ where: { tenantId: shop.tenantId } }),
    movements: await db.getRepository(InventoryMovement).count({ where: { tenantId: shop.tenantId } }),
    batches: await db.getRepository(Batch).count({ where: { tenantId: shop.tenantId } }),
  });

  beforeAll(async () => {
    database = await startTestDatabase('inventory-docs');
    db = database.db;
    shop = await seedTenant(db, 'documentos');
    other = await seedTenant(db, 'documentos-ajena');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    camisa = await seedVariant(db, shop.tenantId, 'DOC-CAMISA', { purchasePrice: 4 });
    gorra = await seedVariant(db, shop.tenantId, 'DOC-GORRA', { purchasePrice: 2 });
    jean = await seedVariant(db, shop.tenantId, 'DOC-JEAN', { purchasePrice: 9 });
    foreign = await seedVariant(db, other.tenantId, 'DOC-AJENO');
    const cashier = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-docs', password: 'x', isOwner: false }));
    cashierId = cashier.id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('entrada', () => {
    it('registra varias líneas en un documento con número, usuario, comentario, lote y kardex', async () => {
      const doc = await enter([{ variantId: camisa, quantity: 10 }, { variantId: gorra, quantity: 5, unitCost: 3.5 }], { reason: 'DONACION', comment: 'Regalo del proveedor' });

      expect(doc).toMatchObject({ number: 'ENT-000001', kind: 'ENTRY', reason: 'DONACION', comment: 'Regalo del proveedor', branchId: shop.branchId });
      expect(doc.lines.map((l) => [l.sku, l.quantity]).sort()).toEqual([['DOC-CAMISA', 10], ['DOC-GORRA', 5]]);
      expect(await stock(camisa)).toBe(10);
      expect(await stock(gorra)).toBe(5);

      const saved = await db.getRepository(InventoryDocument).findOneByOrFail({ id: doc.id });
      expect(saved.userId).toBe(shop.ownerId);
      const movements = await db.getRepository(InventoryMovement).find({ where: { documentId: doc.id } });
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.type === InventoryMovementType.IN && m.reason === 'DONACION' && m.destinationBranchId === shop.branchId && m.originBranchId === null)).toBe(true);
      // un solo lote por documento, ligado a él; el costo es el escrito o, si falta, el de compra de la variante
      const batches = await db.getRepository(Batch).find({ where: { documentId: doc.id } });
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({ code: 'ENT-000001', notes: 'Regalo del proveedor' });
      const layers = await db.getRepository(ProductBatch).find({ where: { batchId: batches[0].id } });
      expect(Object.fromEntries(layers.map((l) => [l.variantId, Number(l.unitCost)]))).toEqual({ [camisa]: 4, [gorra]: 3.5 });
    });

    it('la misma variante repetida con el mismo costo se junta en una línea', async () => {
      const before = await stock(jean);
      const doc = await enter([{ variantId: jean, quantity: 1 }, { variantId: jean, quantity: 2 }]);

      expect(doc.lines).toEqual([{ variantId: jean, sku: 'DOC-JEAN', quantity: 3, type: 'IN' }]);
      expect(await stock(jean)).toBe(before + 3);
    });

    it('reparte el stock por sucursal', async () => {
      await enter([{ variantId: jean, quantity: 4 }], { branchId: norte });

      expect(await stock(jean, norte)).toBe(4);
    });
  });

  describe('salida', () => {
    it('descuenta de cada línea y consume el lote más antiguo primero', async () => {
      const v = await seedVariant(db, shop.tenantId, 'DOC-FIFO');
      await enter([{ variantId: v, quantity: 5, unitCost: 1 }]);
      await enter([{ variantId: v, quantity: 5, unitCost: 2 }]);

      const doc = await leave([{ variantId: v, quantity: 7 }], { reason: 'PERDIDA' });

      expect(doc).toMatchObject({ kind: 'EXIT', reason: 'PERDIDA' });
      expect(await stock(v)).toBe(3);
      const layers = await db.getRepository(ProductBatch).find({ where: { variantId: v }, order: { createdAt: 'ASC' } });
      expect(layers.map((l) => Number(l.remainingQuantity))).toEqual([0, 3]);
      const movement = await db.getRepository(InventoryMovement).findOneByOrFail({ documentId: doc.id });
      expect(movement).toMatchObject({ type: 'OUT', reason: 'PERDIDA', originBranchId: shop.branchId, destinationBranchId: null });
    });

    it('todo o nada: una línea sin stock rechaza el documento entero y dice cuáles fallaron', async () => {
      const ok = await seedVariant(db, shop.tenantId, 'DOC-OK');
      const empty = await seedVariant(db, shop.tenantId, 'DOC-VACIA');
      await enter([{ variantId: ok, quantity: 5 }]);
      const before = await counts();

      await expect(leave([{ variantId: ok, quantity: 2 }, { variantId: empty, quantity: 1 }])).rejects.toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        status: 409,
        details: { branchId: shop.branchId, lines: [{ variantId: empty, sku: 'DOC-VACIA', available: 0, requested: 1 }] },
      });

      expect(await stock(ok)).toBe(5);
      expect(await stock(empty)).toBe(0);
      expect(await counts()).toEqual(before);
    });

    it('un stock negativo (por ventas) tampoco permite sacar', async () => {
      const negative = await seedVariant(db, shop.tenantId, 'DOC-NEG');
      await db.getRepository(ProductStock).save({ branchId: shop.branchId, variantId: negative, quantity: -2 });

      await expect(leave([{ variantId: negative, quantity: 1 }])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(await stock(negative)).toBe(-2);
    });

    it('un rechazo no consume número: el siguiente documento sigue la serie', async () => {
      const v = await seedVariant(db, shop.tenantId, 'DOC-SERIE');
      await enter([{ variantId: v, quantity: 2 }]);
      const last = await db.getRepository(InventoryDocument).count({ where: { tenantId: shop.tenantId, kind: InventoryDocumentKind.EXIT } });
      await expect(leave([{ variantId: v, quantity: 99 }])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

      const doc = await leave([{ variantId: v, quantity: 1 }]);

      expect(doc.number).toBe(`SAL-${String(last + 1).padStart(6, '0')}`);
    });

    it('dos salidas simultáneas que juntas superan el stock: solo una se registra', async () => {
      const v = await seedVariant(db, shop.tenantId, 'DOC-RACE');
      await enter([{ variantId: v, quantity: 5 }]);

      const results = await Promise.allSettled([leave([{ variantId: v, quantity: 3 }]), leave([{ variantId: v, quantity: 3 }])]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await stock(v)).toBe(2);
    });

    it('dos documentos simultáneos con líneas cruzadas no se bloquean entre sí (orden fijo)', async () => {
      const a = await seedVariant(db, shop.tenantId, 'DOC-X1');
      const b = await seedVariant(db, shop.tenantId, 'DOC-X2');
      await enter([{ variantId: a, quantity: 10 }, { variantId: b, quantity: 10 }]);

      const results = await Promise.all([
        leave([{ variantId: a, quantity: 1 }, { variantId: b, quantity: 1 }]),
        leave([{ variantId: b, quantity: 1 }, { variantId: a, quantity: 1 }]),
      ]);

      expect(new Set(results.map((r) => r.number)).size).toBe(2);
      expect([await stock(a), await stock(b)]).toEqual([8, 8]);
    });
  });

  describe('validaciones', () => {
    it('rechaza un motivo que no corresponde al tipo o que es de venta/compra', async () => {
      await expect(enter([{ variantId: camisa, quantity: 1 }], { reason: 'MERMA' })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON', status: 400 });
      await expect(leave([{ variantId: camisa, quantity: 1 }], { reason: 'VENTA' })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
    });

    it('los motivos que ya no se eligen (los antiguos) se rechazan aunque existan para mostrar el historial', async () => {
      for (const reason of ['CADUCIDAD', 'OTRO_EGRESO', 'ADJUSTMENT']) {
        await expect(leave([{ variantId: camisa, quantity: 1 }], { reason })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
      }
      for (const reason of ['OTRO_INGRESO', 'ADJUSTMENT']) {
        await expect(enter([{ variantId: camisa, quantity: 1 }], { reason })).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
      }
    });

    it('toda salida manual exige un comentario de verdad: sin él, vacío, de espacios o demasiado corto se rechaza y no se guarda nada', async () => {
      const before = await counts();
      for (const comment of [undefined, '', '    ', 'ok', 'abc']) {
        await expect(post({ kind: InventoryDocumentKind.EXIT, reason: 'MERMA', lines: [{ variantId: camisa, quantity: 1 }], comment })).rejects.toMatchObject({ code: 'COMMENT_REQUIRED', status: 400 });
      }
      expect(await counts()).toEqual(before);
    });

    it('todas las salidas lo exigen, sea cual sea su motivo', async () => {
      for (const reason of ['MERMA', 'PERDIDA', 'USO_INTERNO', 'DEVOLUCION_PROVEEDOR', 'OTRO']) {
        await expect(post({ kind: InventoryDocumentKind.EXIT, reason, lines: [{ variantId: camisa, quantity: 1 }] })).rejects.toMatchObject({ code: 'COMMENT_REQUIRED' });
      }
    });

    it('una entrada solo lo exige cuando el motivo es OTRO', async () => {
      await expect(enter([{ variantId: camisa, quantity: 1 }], { reason: 'OTRO' })).rejects.toMatchObject({ code: 'COMMENT_REQUIRED' });
      await expect(enter([{ variantId: camisa, quantity: 1 }], { reason: 'OTRO', comment: 'abc' })).rejects.toMatchObject({ code: 'COMMENT_REQUIRED' });

      const other = await enter([{ variantId: camisa, quantity: 1 }], { reason: 'OTRO', comment: 'Muestra del fabricante' });
      expect(other).toMatchObject({ kind: 'ENTRY', reason: 'OTRO', comment: 'Muestra del fabricante' });
      expect(await enter([{ variantId: camisa, quantity: 1 }], { reason: 'DONACION' })).toMatchObject({ reason: 'DONACION', comment: null });
    });

    it('un comentario corto pero real (robo, roto) sí vale, y se guarda sin los espacios de los lados', async () => {
      const doc = await leave([{ variantId: camisa, quantity: 1 }], { reason: 'PERDIDA', comment: '  robo  ' });
      expect(doc).toMatchObject({ reason: 'PERDIDA', comment: 'robo' });
    });

    it('rechazar por falta de comentario no consume número: el siguiente documento sigue la serie', async () => {
      const first = await enter([{ variantId: camisa, quantity: 1 }]);
      await expect(post({ kind: InventoryDocumentKind.EXIT, reason: 'MERMA', lines: [{ variantId: camisa, quantity: 1 }] })).rejects.toMatchObject({ code: 'COMMENT_REQUIRED' });
      const next = await enter([{ variantId: camisa, quantity: 1 }]);

      expect(Number(next.number.slice(-6))).toBe(Number(first.number.slice(-6)) + 1);
    });

    it('rechaza un documento vacío, cantidades no positivas y demasiadas líneas', async () => {
      await expect(enter([])).rejects.toMatchObject({ code: 'EMPTY_INVENTORY_DOCUMENT' });
      await expect(enter([{ variantId: camisa, quantity: 0 }])).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
      await expect(enter([{ variantId: camisa, quantity: -1 }])).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
      await expect(enter([{ variantId: camisa, quantity: 1, unitCost: -1 }])).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
      const many = Array.from({ length: 201 }, () => ({ variantId: randomUUID(), quantity: 1 }));
      await expect(enter(many)).rejects.toMatchObject({ code: 'INVENTORY_DOCUMENT_TOO_LARGE' });
    });

    it('una variante de otra tienda o inexistente rechaza todo, sin guardar nada', async () => {
      const before = await counts();

      await expect(enter([{ variantId: camisa, quantity: 1 }, { variantId: foreign, quantity: 1 }])).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND', status: 404 });
      await expect(enter([{ variantId: randomUUID(), quantity: 1 }])).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });

      expect(await counts()).toEqual(before);
    });

    it('una sucursal de otra tienda no existe para esta', async () => {
      await expect(enter([{ variantId: camisa, quantity: 1 }], { branchId: other.branchId })).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
    });
  });

  describe('acceso por sucursal', () => {
    it('un usuario sin acceso a la sucursal no puede mover su stock (403)', async () => {
      const before = await counts();

      await expect(leave([{ variantId: camisa, quantity: 1 }], { branchId: norte, userId: cashierId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
      await expect(enter([{ variantId: camisa, quantity: 1 }], { branchId: norte }).then(() => post({ kind: InventoryDocumentKind.ENTRY, reason: 'DONACION', lines: [{ variantId: camisa, quantity: 1 }], branchId: norte, userId: cashierId }))).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });

      expect((await counts()).documents).toBe(before.documents + 1); // solo la entrada del propietario
    });

    it('con acceso a su sucursal sí puede', async () => {
      const doc = await post({ kind: InventoryDocumentKind.ENTRY, reason: 'PRODUCCION', lines: [{ variantId: camisa, quantity: 1 }], userId: cashierId });

      expect(doc.reason).toBe('PRODUCCION');
    });
  });

  describe('idempotencia', () => {
    it('reenviar el mismo documento con su identificador devuelve el mismo y no repite el efecto', async () => {
      const v = await seedVariant(db, shop.tenantId, 'DOC-IDEM');
      const key = randomUUID();
      const first = await enter([{ variantId: v, quantity: 6 }], { clientRequestId: key });
      const second = await enter([{ variantId: v, quantity: 6 }], { clientRequestId: key });

      expect(second.id).toBe(first.id);
      expect(second.number).toBe(first.number);
      expect(second.lines).toEqual(first.lines);
      expect(await stock(v)).toBe(6);
    });

    it('el mismo identificador para otra operación distinta se rechaza', async () => {
      const v = await seedVariant(db, shop.tenantId, 'DOC-IDEM2');
      const key = randomUUID();
      await enter([{ variantId: v, quantity: 6 }], { clientRequestId: key });

      await expect(enter([{ variantId: v, quantity: 7 }], { clientRequestId: key })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
      await expect(leave([{ variantId: v, quantity: 6 }], { clientRequestId: key })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(await stock(v)).toBe(6);
    });

    it('dos reintentos simultáneos con el mismo identificador dejan un solo documento', async () => {
      const v = await seedVariant(db, shop.tenantId, 'DOC-IDEM3');
      const key = randomUUID();

      const [a, b] = await Promise.all([enter([{ variantId: v, quantity: 4 }], { clientRequestId: key }), enter([{ variantId: v, quantity: 4 }], { clientRequestId: key })]);

      expect(a.id).toBe(b.id);
      expect(await stock(v)).toBe(4);
      expect(await db.getRepository(InventoryDocument).count({ where: { tenantId: shop.tenantId, clientRequestId: key } })).toBe(1);
    });

    it('dos salidas simultáneas con el mismo identificador que dejan el stock en 0: la segunda repite la respuesta, no falla por falta de stock', async () => {
      // varias rondas: la carrera solo aparece si el segundo reintento llega mientras el primero aún no confirmó
      for (let round = 0; round < 8; round++) {
        const v = await seedVariant(db, shop.tenantId, `DOC-IDEM4-${round}`);
        await enter([{ variantId: v, quantity: 5 }]);
        const key = randomUUID();

        const results = await Promise.all([1, 2, 3].map(() => leave([{ variantId: v, quantity: 5 }], { clientRequestId: key })));

        expect(new Set(results.map((r) => r.id)).size).toBe(1);
        expect(await stock(v)).toBe(0);
      }
    });

    it('el identificador es por tienda: otra tienda puede usar el mismo', async () => {
      const key = randomUUID();
      const mine = await enter([{ variantId: camisa, quantity: 1 }], { clientRequestId: key });
      const theirs = await post({ kind: InventoryDocumentKind.ENTRY, reason: 'DONACION', lines: [{ variantId: foreign, quantity: 1 }], branchId: other.branchId, userId: other.ownerId, tenant: other, clientRequestId: key });

      expect(theirs.id).not.toBe(mine.id);
    });
  });

  describe('historial', () => {
    it('el historial muestra el número, el comentario y quién lo hizo', async () => {
      const v = await seedVariant(db, shop.tenantId, 'DOC-HIST');
      const doc = await enter([{ variantId: v, quantity: 2 }], { comment: 'Para historial' });

      const page = await new GetInventoryMovementsHandler(db.manager, redisStub).execute(
        new GetInventoryMovementsQuery(shop.tenantId, shop.ownerId, true, { page: 1, limit: 10, variantId: v, startDate: '2020-01-01', endDate: '2100-01-01' }),
      );

      expect(page.data).toHaveLength(1);
      expect(page.data[0].document).toEqual({ id: doc.id, number: doc.number, comment: 'Para historial', userName: 'Dueño', kind: 'ENTRY', counterpartBranchName: null });
    });
  });
});
