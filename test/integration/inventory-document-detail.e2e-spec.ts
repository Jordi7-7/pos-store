import { DataSource } from 'typeorm';
import { InventoryDocumentKind } from '../../src/common/enums/inventory-document-kind.enum';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { CreateInventoryDocumentCommand } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { CreateStockTransferCommand } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.command';
import { CreateStockTransferHandler } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.handler';
import { GetInventoryDocumentHandler } from '../../src/modules/products/application/queries/get-inventory-document/get-inventory-document.handler';
import { GetInventoryDocumentQuery } from '../../src/modules/products/application/queries/get-inventory-document/get-inventory-document.query';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Abrir un documento de inventario con todas sus líneas: contenido, aislamiento por tienda y acceso por sucursal. */
describe('Documento de inventario: detalle', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let norte: string;
  let camisa: string;
  let gorra: string;
  let matrizOnly: string;
  let norteOnly: string;
  let nobody: string;
  let entryId: string;
  let transferId: string;

  const detail = (documentId: string, userId: string | undefined, isOwner: boolean, tenantId = shop.tenantId) =>
    new GetInventoryDocumentHandler(db.manager, redisStub).execute(new GetInventoryDocumentQuery(tenantId, userId, isOwner, documentId));

  const cashier = async (username: string, branchId?: string): Promise<string> => {
    const user = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: username, username, password: 'x', isOwner: false }));
    if (branchId) await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [user.id, branchId]);
    return user.id;
  };

  beforeAll(async () => {
    database = await startTestDatabase('doc-detail');
    db = database.db;
    shop = await seedTenant(db, 'detalle');
    other = await seedTenant(db, 'detalle-ajena');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    camisa = await seedVariant(db, shop.tenantId, 'DET-CAMISA', { purchasePrice: 4 });
    gorra = await seedVariant(db, shop.tenantId, 'DET-GORRA', { purchasePrice: 2 });
    matrizOnly = await cashier('solo-matriz', shop.branchId);
    norteOnly = await cashier('solo-norte', norte);
    nobody = await cashier('sin-sucursal');

    const documents = new CreateInventoryDocumentHandler(db.manager, redisStub);
    // Se registra en este orden a propósito (GORRA antes que CAMISA) para comprobar que el detalle ordena por SKU
    entryId = (await documents.execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: gorra, quantity: 6, unitCost: 3.5 }, { variantId: camisa, quantity: 10 }], 'Regalo del proveedor'))).id;
    transferId = (await new CreateStockTransferHandler(db.manager, redisStub).execute(new CreateStockTransferCommand(shop.tenantId, shop.ownerId, shop.branchId, norte, 'TRASLADO', [{ variantId: camisa, quantity: 4 }], 'Reposición'))).id;
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('una entrada: cabecera completa y sus líneas ordenadas por SKU, con costo y saldo', async () => {
    const result = await detail(entryId, shop.ownerId, true);

    expect(result).toMatchObject({ id: entryId, number: 'ENT-000001', kind: 'ENTRY', reason: 'DONACION', comment: 'Regalo del proveedor', userName: 'Dueño', branch: { name: 'Matriz' }, destinationBranch: null });
    expect(result.lines.map((l) => [l.sku, l.type, l.quantity, l.unitCost, l.balanceAfter, l.branchName])).toEqual([
      ['DET-CAMISA', 'IN', 10, 4, 10, 'Matriz'],
      ['DET-GORRA', 'IN', 6, 3.5, 6, 'Matriz'],
    ]);
    expect(result.lines[0].productName).toBe('DET-CAMISA');
  });

  it('un traslado: la salida del origen y la entrada al destino, con la sucursal de cada una', async () => {
    const result = await detail(transferId, shop.ownerId, true);

    expect(result).toMatchObject({ number: 'TRS-000001', kind: 'TRANSFER', branch: { name: 'Matriz' }, destinationBranch: { name: 'Norte' } });
    expect(result.lines.map((l) => [l.sku, l.type, l.quantity, l.branchName, l.balanceAfter])).toEqual([
      ['DET-CAMISA', 'OUT', 4, 'Matriz', 6],
      ['DET-CAMISA', 'IN', 4, 'Norte', 4],
    ]);
  });

  it('un documento que no existe, o que es de otra tienda, no existe (404)', async () => {
    await expect(detail('00000000-0000-4000-8000-000000000000', shop.ownerId, true)).rejects.toMatchObject({ code: 'INVENTORY_DOCUMENT_NOT_FOUND', status: 404 });
    await expect(detail(entryId, other.ownerId, true, other.tenantId)).rejects.toMatchObject({ code: 'INVENTORY_DOCUMENT_NOT_FOUND', status: 404 });
  });

  it('quien no es propietario lo ve si tiene acceso a la sucursal que lo emitió', async () => {
    expect(await detail(entryId, matrizOnly, false)).toMatchObject({ number: 'ENT-000001' });
  });

  it('un traslado también lo ve quien solo tiene acceso a la sucursal que recibe', async () => {
    expect(await detail(transferId, norteOnly, false)).toMatchObject({ number: 'TRS-000001' });
  });

  it('sin acceso a ninguna de las sucursales del documento: 403 BRANCH_ACCESS_DENIED y no se revela nada', async () => {
    await expect(detail(entryId, norteOnly, false)).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
    await expect(detail(entryId, nobody, false)).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
  });
});
