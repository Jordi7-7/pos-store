import { DataSource } from 'typeorm';
import { InventoryDocumentKind } from '../../src/common/enums/inventory-document-kind.enum';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { CreateInventoryDocumentCommand } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { CreateStockCountCommand } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.command';
import { CreateStockCountHandler } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.handler';
import { CreateStockTransferCommand } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.command';
import { CreateStockTransferHandler } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.handler';
import { GetInventoryDocumentsHandler } from '../../src/modules/products/application/queries/get-inventory-documents/get-inventory-documents.handler';
import { GetInventoryDocumentsQuery } from '../../src/modules/products/application/queries/get-inventory-documents/get-inventory-documents.query';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Lista de documentos de inventario: un documento por fila, con sus totales, filtros, paginación y acceso por sucursal. */
describe('Documentos de inventario: lista', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let norte: string;
  let matrizOnly: string;
  let norteOnly: string;
  let nobody: string;

  type Filters = Partial<GetInventoryDocumentsQuery['filters']>;
  const list = (filters: Filters = {}, userId: string | undefined = shop.ownerId, isOwner = true, tenantId = shop.tenantId) =>
    new GetInventoryDocumentsHandler(db.manager, redisStub).execute(
      new GetInventoryDocumentsQuery(tenantId, userId, isOwner, { page: 1, limit: 50, startDate: '2020-01-01', endDate: '2100-01-01', ...filters }),
    );
  const numbers = async (filters: Filters = {}, ...who: [string | undefined, boolean] | []) => (await list(filters, ...(who as [string | undefined, boolean]))).data.map((d) => d.number);

  const cashier = async (username: string, branchId?: string): Promise<string> => {
    const user = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: username, username, password: 'x', isOwner: false }));
    if (branchId) await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [user.id, branchId]);
    return user.id;
  };

  beforeAll(async () => {
    database = await startTestDatabase('doc-list');
    db = database.db;
    shop = await seedTenant(db, 'lista');
    other = await seedTenant(db, 'lista-ajena');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    const camisa = await seedVariant(db, shop.tenantId, 'LST-CAMISA', { purchasePrice: 4 });
    const gorra = await seedVariant(db, shop.tenantId, 'LST-GORRA', { purchasePrice: 2 });
    const foreign = await seedVariant(db, other.tenantId, 'LST-AJENO');
    matrizOnly = await cashier('lista-matriz', shop.branchId);
    norteOnly = await cashier('lista-norte', norte);
    nobody = await cashier('lista-ninguna');

    const documents = new CreateInventoryDocumentHandler(db.manager, redisStub);
    // Se registran en este orden: la lista debe devolverlos del más reciente al más antiguo
    await documents.execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: camisa, quantity: 10 }, { variantId: gorra, quantity: 6 }], 'Regalo del proveedor'));
    await documents.execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.EXIT, 'MERMA', [{ variantId: camisa, quantity: 3 }], 'Se dañó'));
    // existencias ahora: camisa 7, gorra 6 → contado 12 (+5) y 4 (−2)
    await new CreateStockCountHandler(db.manager, redisStub).execute(
      new CreateStockCountCommand(shop.tenantId, shop.ownerId, shop.branchId, 'CONTEO_FISICO', [{ variantId: camisa, counted: 12, expected: 7 }, { variantId: gorra, counted: 4, expected: 6 }]),
    );
    await new CreateStockTransferHandler(db.manager, redisStub).execute(new CreateStockTransferCommand(shop.tenantId, shop.ownerId, shop.branchId, norte, 'TRASLADO', [{ variantId: camisa, quantity: 4 }], 'Reposición'));
    await new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(other.tenantId, other.ownerId, other.branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: foreign, quantity: 1 }]));
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('un documento por fila, del más reciente al más antiguo, con su cabecera, productos y unidades', async () => {
    const result = await list();

    expect(result.data.map((d) => [d.number, d.kind, d.productsCount, d.unitsCount])).toEqual([
      ['TRS-000001', 'TRANSFER', 1, 4], // el traslado cuenta las 4 unidades una sola vez (no la salida y la entrada)
      ['CNT-000001', 'COUNT', 2, 7], // el conteo suma las diferencias: +5 y −2
      ['SAL-000001', 'EXIT', 1, 3],
      ['ENT-000001', 'ENTRY', 2, 16],
    ]);
    expect(result.meta).toEqual({ total: 4, page: 1, limit: 50, totalPages: 1 });
    expect(result.data[3]).toMatchObject({ reason: 'DONACION', comment: 'Regalo del proveedor', userName: 'Dueño', branch: { name: 'Matriz' }, destinationBranch: null });
    expect(result.data[0]).toMatchObject({ branch: { name: 'Matriz' }, destinationBranch: { name: 'Norte' } });
  });

  it('filtra por tipo de documento', async () => {
    expect(await numbers({ kind: InventoryDocumentKind.EXIT })).toEqual(['SAL-000001']);
    expect(await numbers({ kind: InventoryDocumentKind.COUNT })).toEqual(['CNT-000001']);
  });

  it('filtra por sucursal: un traslado aparece en la que envía y en la que recibe', async () => {
    expect(await numbers({ branchId: shop.branchId })).toHaveLength(4);
    expect(await numbers({ branchId: norte })).toEqual(['TRS-000001']);
  });

  it('busca por número, por comentario o por el SKU de alguna de sus líneas', async () => {
    expect(await numbers({ search: 'ENT-000001' })).toEqual(['ENT-000001']);
    expect(await numbers({ search: 'proveedor' })).toEqual(['ENT-000001']);
    expect(await numbers({ search: 'LST-GORRA' })).toEqual(['CNT-000001', 'ENT-000001']);
    expect(await numbers({ search: '   ' })).toHaveLength(4);
  });

  it('los comodines de la búsqueda se toman literales: «%» no coincide con todo', async () => {
    expect(await numbers({ search: '%' })).toEqual([]);
    expect(await numbers({ search: '_' })).toEqual([]);
  });

  it('filtra por fechas', async () => {
    expect(await numbers({ startDate: '2020-01-01', endDate: '2020-01-31' })).toEqual([]);
    expect(await numbers({ startDate: '2020-01-01', endDate: '2100-01-01' })).toHaveLength(4);
  });

  it('pagina: el total y las páginas cuentan todos los documentos', async () => {
    const second = await list({ page: 2, limit: 2 });

    expect(second.data.map((d) => d.number)).toEqual(['SAL-000001', 'ENT-000001']);
    expect(second.meta).toEqual({ total: 4, page: 2, limit: 2, totalPages: 2 });
  });

  it('cada tienda ve solo sus documentos', async () => {
    // La tienda sale del token: la otra tienda ve solo su documento, y esta no ve el de la otra (4 documentos, ninguno ajeno)
    expect((await list({}, other.ownerId, true, other.tenantId)).data.map((d) => d.number)).toEqual(['ENT-000001']);
    expect((await list()).data.map((d) => d.id)).not.toContain((await list({}, other.ownerId, true, other.tenantId)).data[0].id);
  });

  describe('acceso por sucursal', () => {
    it('quien no es propietario ve los documentos de sus sucursales', async () => {
      expect(await numbers({}, matrizOnly, false)).toHaveLength(4);
      expect(await numbers({}, norteOnly, false)).toEqual(['TRS-000001']); // solo el traslado que recibe
    });

    it('sin sucursales asignadas no ve nada', async () => {
      expect(await numbers({}, nobody, false)).toEqual([]);
    });

    it('pedir una sucursal ajena es 403 BRANCH_ACCESS_DENIED', async () => {
      await expect(list({ branchId: norte }, matrizOnly, false)).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
    });
  });

  it('un documento de una sucursal que se borró después sigue en la lista, con su nombre', async () => {
    const sur = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Sur', address: 'x', code: 3 }))).id;
    const variant = await seedVariant(db, shop.tenantId, 'LST-SUR');
    await new CreateInventoryDocumentHandler(db.manager, redisStub).execute(new CreateInventoryDocumentCommand(shop.tenantId, shop.ownerId, shop.branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: variant, quantity: 5 }]));
    await new CreateStockTransferHandler(db.manager, redisStub).execute(new CreateStockTransferCommand(shop.tenantId, shop.ownerId, shop.branchId, sur, 'TRASLADO', [{ variantId: variant, quantity: 3 }]));
    await db.getRepository(Branch).softDelete(sur);

    const result = await list({ search: 'LST-SUR', kind: InventoryDocumentKind.TRANSFER });

    expect(result.data).toMatchObject([{ kind: 'TRANSFER', branch: { name: 'Matriz' }, destinationBranch: { name: 'Sur' }, productsCount: 1, unitsCount: 3 }]);
  });
});
