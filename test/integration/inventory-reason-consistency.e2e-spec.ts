import { DataSource } from 'typeorm';
import { CreateInventoryDocumentCommand } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { CreateStockCountCommand } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.command';
import { CreateStockCountHandler } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.handler';
import { CreateStockTransferCommand } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.command';
import { CreateStockTransferHandler } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.handler';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { InventoryDocument } from '../../src/modules/products/domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { InventoryDocumentKind } from '../../src/common/enums/inventory-document-kind.enum';
import { InventoryMovementType } from '../../src/common/enums/inventory-movement-type.enum';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * El motivo vive en la cabecera (`inventory_documents.reason`) y se copia a cada línea del kardex
 * (`inventory_movements.reason`). La fuente de verdad es la línea; esta prueba garantiza que ninguna operación
 * deje las dos copias distintas.
 */
describe('El motivo de un documento coincide con el de todas sus líneas del kardex', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let norte: string;
  let a: string;
  let b: string;

  const documents = () => new CreateInventoryDocumentHandler(db.manager, redisStub);
  const doc = (kind: InventoryDocumentKind, reason: string, lines: Array<{ variantId: string; quantity: number }>, branchId = shop.branchId) =>
    documents().execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, branchId, kind, reason, lines, 'Documento de prueba'));

  /** Todos los documentos de la tienda con el motivo de su cabecera y el de cada una de sus líneas. */
  const mismatches = async (): Promise<string[]> => {
    const rows: Array<{ number: string; header: string; line: string }> = await db.query(
      `SELECT d.number, d.reason AS header, m.reason AS line
         FROM inventory_documents d
         JOIN inventory_movements m ON m.document_id = d.id
        WHERE d.tenant_id = $1 AND m.reason <> d.reason`,
      [shop.tenantId],
    );
    return rows.map((row) => `${row.number}: cabecera ${row.header} ≠ línea ${row.line}`);
  };
  const linesOf = async (documentId: string) => db.getRepository(InventoryMovement).count({ where: { documentId } });

  beforeAll(async () => {
    database = await startTestDatabase('reason-consistency');
    db = database.db;
    shop = await seedTenant(db, 'motivos');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    a = await seedVariant(db, shop.tenantId, 'MOT-A');
    b = await seedVariant(db, shop.tenantId, 'MOT-B');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('cada tipo de documento copia su motivo a todas sus líneas', async () => {
    const entries = ['DONACION', 'PRODUCCION', 'OTRO'];
    const exits = ['MERMA', 'PERDIDA', 'USO_INTERNO', 'DEVOLUCION_PROVEEDOR', 'OTRO'];
    const created: InventoryDocument[] = [];

    for (const reason of entries) created.push(await db.getRepository(InventoryDocument).findOneByOrFail({ id: (await doc(InventoryDocumentKind.ENTRY, reason, [{ variantId: a, quantity: 10 }, { variantId: b, quantity: 10 }])).id }));
    for (const reason of exits) created.push(await db.getRepository(InventoryDocument).findOneByOrFail({ id: (await doc(InventoryDocumentKind.EXIT, reason, [{ variantId: a, quantity: 1 }, { variantId: b, quantity: 1 }])).id }));
    for (const reason of ['TRASLADO']) {
      const transfer = await new CreateStockTransferHandler(db.manager, redisStub).execute(new CreateStockTransferCommand(shop.tenantId, shop.ownerId, shop.branchId, norte, reason, [{ variantId: a, quantity: 1 }, { variantId: b, quantity: 1 }]));
      created.push(await db.getRepository(InventoryDocument).findOneByOrFail({ id: transfer.id }));
    }
    for (const reason of ['CONTEO_FISICO']) {
      const count = await new CreateStockCountHandler(db.manager, redisStub).execute(
        new CreateStockCountCommand(shop.tenantId, shop.ownerId, shop.branchId, reason, [await countLine(a, 3), await countLine(b, -1)]),
      );
      created.push(await db.getRepository(InventoryDocument).findOneByOrFail({ id: count.id }));
    }

    for (const document of created) expect([document.number, await linesOf(document.id) > 0]).toEqual([document.number, true]); // todos tienen líneas
    expect(created.map((d) => d.kind)).toEqual(expect.arrayContaining([InventoryDocumentKind.ENTRY, InventoryDocumentKind.EXIT, InventoryDocumentKind.TRANSFER, InventoryDocumentKind.COUNT]));
    expect(await mismatches()).toEqual([]);
  });

  it('un conteo que suma y resta a la vez usa el mismo motivo en las entradas y en las salidas', async () => {
    const count = await new CreateStockCountHandler(db.manager, redisStub).execute(
      new CreateStockCountCommand(shop.tenantId, shop.ownerId, shop.branchId, 'CONTEO_FISICO', [await countLine(a, -1), await countLine(b, 5)]),
    );

    const lines = await db.getRepository(InventoryMovement).find({ where: { documentId: count.id } });
    expect(new Set(lines.map((l) => l.type))).toEqual(new Set([InventoryMovementType.IN, InventoryMovementType.OUT]));
    expect(new Set(lines.map((l) => l.reason))).toEqual(new Set(['CONTEO_FISICO']));
  });

  it('un traslado deja el mismo motivo en la salida del origen y en la entrada del destino', async () => {
    await doc(InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: a, quantity: 5 }]);
    const transfer = await new CreateStockTransferHandler(db.manager, redisStub).execute(new CreateStockTransferCommand(shop.tenantId, shop.ownerId, shop.branchId, norte, 'TRASLADO', [{ variantId: a, quantity: 1 }]));

    const lines = await db.getRepository(InventoryMovement).find({ where: { documentId: transfer.id } });
    expect(lines.map((l) => [l.type, l.reason]).sort()).toEqual([['IN', 'TRASLADO'], ['OUT', 'TRASLADO']]);
  });

  it('la comprobación detecta una divergencia (si alguien cambiara una de las dos copias, este test fallaría)', async () => {
    const created = await doc(InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: a, quantity: 1 }]);
    await db.query(`UPDATE inventory_movements SET reason = 'MERMA' WHERE document_id = $1`, [created.id]);

    expect(await mismatches()).toEqual([`${created.number}: cabecera DONACION ≠ línea MERMA`]);

    await db.query(`UPDATE inventory_movements SET reason = 'DONACION' WHERE document_id = $1`, [created.id]);
    expect(await mismatches()).toEqual([]);
  });

  /** Línea de conteo con una diferencia segura (`delta` ≠ 0) respecto al stock de ahora, sin importar lo que dejaron los tests anteriores. */
  async function countLine(variantId: string, delta: number) {
    const expected = await stockOf(variantId);
    return { variantId, expected, counted: Math.max(0, expected + delta) === expected ? expected + Math.abs(delta) : Math.max(0, expected + delta) };
  }

  async function stockOf(variantId: string): Promise<number> {
    const rows: Array<{ quantity: string }> = await db.query(`SELECT quantity FROM product_stocks WHERE branch_id = $1 AND variant_id = $2`, [shop.branchId, variantId]);
    return Number(rows[0]?.quantity ?? 0);
  }
});
