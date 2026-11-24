import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { InventoryDocumentKind } from '../../src/common/enums/inventory-document-kind.enum';
import { InventoryMovementCategory } from '../../src/common/enums/inventory-movement-category.enum';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { CreateInventoryDocumentCommand } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { CreateStockCountCommand } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.command';
import { CreateStockCountHandler } from '../../src/modules/products/application/commands/create-stock-count/create-stock-count.handler';
import { CreateStockTransferCommand } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.command';
import { CreateStockTransferHandler } from '../../src/modules/products/application/commands/create-stock-transfer/create-stock-transfer.handler';
import { GetInventoryMovementsHandler } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.handler';
import { GetInventoryMovementsQuery } from '../../src/modules/products/application/queries/get-inventory-movements/get-inventory-movements.query';
import { recordInitialStock } from '../../src/modules/products/application/services/initial-stock';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { CancelPurchaseOrderCommand } from '../../src/modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.command';
import { CancelPurchaseOrderHandler } from '../../src/modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.handler';
import { RegisterPurchaseCommand } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.command';
import { RegisterPurchaseHandler } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.handler';
import { ProcessRefundCommand } from '../../src/modules/sales/application/commands/process-refund/process-refund.command';
import { ProcessRefundHandler } from '../../src/modules/sales/application/commands/process-refund/process-refund.handler';
import { ProcessSaleCommand } from '../../src/modules/sales/application/commands/process-sale/process-sale.command';
import { ProcessSaleHandler } from '../../src/modules/sales/application/commands/process-sale/process-sale.handler';
import { CashRegister } from '../../src/modules/sales/domain/entities/cash-register.entity';
import { CashSession } from '../../src/modules/sales/domain/entities/cash-session.entity';
import { PaymentMethod } from '../../src/modules/sales/domain/entities/sale-payment.entity';
import { CashSessionStatus } from '../../src/modules/sales/domain/enums/cash-session-status.enum';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * El kardex completo: cada flujo que mueve stock (stock inicial, compra, venta, devolución, entrada/salida manual, conteo,
 * traslado y anulación de compra) deja líneas con su categoría, dirección, costo unitario y saldo, y los saldos forman una
 * cadena que termina en la existencia real. La comprobación de deriva es la misma consulta que usa `scripts/reconcile-inventory.sql`.
 */
describe('Kardex: categoría, costo y saldo en cada línea', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let norte: string;
  let a: string;
  let b: string;
  let cashSessionId: string;
  let saleId: string;
  let purchaseId: string;

  const owner = () => shop.ownerId;
  const linesOf = (variantId: string) => db.getRepository(InventoryMovement).find({ where: { variantId }, order: { createdAt: 'ASC' } });
  const lastLine = async (variantId: string) => (await linesOf(variantId)).slice(-1)[0];
  const stockOf = async (variantId: string, branchId = shop.branchId): Promise<number> => Number((await db.getRepository(ProductStock).findOneBy({ branchId, variantId }))?.quantity ?? 0);

  /** La consulta de deriva del script de conciliación, tal cual (entre las marcas `@begin drift` y `@end drift`). */
  const drift = async (): Promise<Array<{ sku: string; problema: string }>> => {
    const script = fs.readFileSync(path.join(__dirname, '../../scripts/reconcile-inventory.sql'), 'utf8');
    const sql = script.slice(script.indexOf('-- @begin drift') + '-- @begin drift'.length, script.indexOf('-- @end drift'));
    return db.query(sql);
  };

  beforeAll(async () => {
    database = await startTestDatabase('ledger');
    db = database.db;
    shop = await seedTenant(db, 'kardex');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    a = await seedVariant(db, shop.tenantId, 'KDX-A', { purchasePrice: 4 });
    b = await seedVariant(db, shop.tenantId, 'KDX-B', { purchasePrice: 5 });
    const register = await db.getRepository(CashRegister).save(db.getRepository(CashRegister).create({ tenantId: shop.tenantId, branchId: shop.branchId, code: 1, name: 'Caja 1' }));
    cashSessionId = (
      await db.getRepository(CashSession).save(
        db.getRepository(CashSession).create({ branchId: shop.branchId, userId: owner(), cashRegisterId: register.id, openingBalance: 0, status: CashSessionStatus.OPEN, openedAt: new Date() }),
      )
    ).id;
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('stock inicial: categoría INITIAL, entra con su costo y el saldo es la propia cantidad', async () => {
    await db.getRepository(ProductStock).save({ branchId: shop.branchId, variantId: a, quantity: 10 });
    await recordInitialStock(db.manager, shop.tenantId, [{ branchId: shop.branchId, variantId: a, sku: 'KDX-A', quantity: 10, unitCost: 3 }]);

    expect(await lastLine(a)).toMatchObject({ category: InventoryMovementCategory.INITIAL, type: 'IN', reason: 'INITIAL_STOCK', quantity: 10, unitCost: 3, balanceAfter: 10, originBranchId: null, destinationBranchId: shop.branchId });
  });

  it('compra: categoría PURCHASE, el costo es el de la compra y el saldo suma lo que había', async () => {
    const order = await new RegisterPurchaseHandler(db.manager, redisStub).execute(
      new RegisterPurchaseCommand(shop.tenantId, owner(), shop.supplierId, shop.branchId, 'F-1', [{ variantId: a, quantity: 5, purchasePrice: 6 }]),
    );
    purchaseId = order.id;

    expect(await lastLine(a)).toMatchObject({ category: 'PURCHASE', type: 'IN', reason: 'COMPRA', quantity: 5, unitCost: 6, balanceAfter: 15, purchaseOrderId: order.id });
  });

  it('venta: categoría SALE, el costo es el FIFO de lo vendido y el saldo es lo que queda', async () => {
    const sale = await new ProcessSaleHandler(db.manager, redisStub).execute(
      new ProcessSaleCommand(shop.tenantId, owner(), shop.branchId, cashSessionId, undefined, [{ variantId: a, quantity: 3, price: 10 }], [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 30 }]),
    );
    saleId = sale.id;

    // sale de la capa más antigua (10 a 3): el costo de la línea es 3, igual que el de la venta
    expect(await lastLine(a)).toMatchObject({ category: 'SALE', type: 'OUT', reason: 'VENTA', quantity: 3, unitCost: 3, balanceAfter: 12, originBranchId: shop.branchId, destinationBranchId: null });
  });

  it('devolución de cliente: categoría RETURN, entra al costo con el que se vendió', async () => {
    await new ProcessRefundHandler(db.manager, redisStub).execute(new ProcessRefundCommand(shop.tenantId, owner(), shop.branchId, saleId, cashSessionId, 'Prueba', [{ variantId: a, quantity: 1 }]));

    expect(await lastLine(a)).toMatchObject({ category: 'RETURN', type: 'IN', reason: 'DEVOLUCION', quantity: 1, unitCost: 3, balanceAfter: 13 });
  });

  it('entrada manual: categoría ADJUSTMENT con el costo escrito; salida manual: ADJUSTMENT con el costo FIFO', async () => {
    const documents = () => new CreateInventoryDocumentHandler(db.manager, redisStub);
    await documents().execute(new CreateInventoryDocumentCommand(shop.tenantId, owner(), shop.branchId, InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: a, quantity: 4, unitCost: 2 }]));
    expect(await lastLine(a)).toMatchObject({ category: 'ADJUSTMENT', type: 'IN', reason: 'DONACION', quantity: 4, unitCost: 2, balanceAfter: 17 });

    await documents().execute(new CreateInventoryDocumentCommand(shop.tenantId, owner(), shop.branchId, InventoryDocumentKind.EXIT, 'MERMA', [{ variantId: a, quantity: 2 }], 'Se dañó'));
    expect(await lastLine(a)).toMatchObject({ category: 'ADJUSTMENT', type: 'OUT', reason: 'MERMA', quantity: 2, unitCost: 3, balanceAfter: 15 });
  });

  it('conteo: categoría COUNT; lo que sobra entra al costo de compra de la variante', async () => {
    await new CreateStockCountHandler(db.manager, redisStub).execute(new CreateStockCountCommand(shop.tenantId, owner(), shop.branchId, 'CONTEO_FISICO', [{ variantId: a, counted: 20, expected: 15 }]));

    const variant = await db.getRepository(ProductVariant).findOneByOrFail({ id: a });
    const line = await lastLine(a);
    expect(line).toMatchObject({ category: 'COUNT', type: 'IN', reason: 'CONTEO_FISICO', quantity: 5, balanceAfter: 20 });
    expect(line.unitCost).toBeCloseTo(Number(variant.purchasePrice), 4);
  });

  it('traslado: dos líneas TRANSFER, la salida con el saldo del origen y la entrada con el del destino, al mismo costo', async () => {
    await new CreateStockTransferHandler(db.manager, redisStub).execute(new CreateStockTransferCommand(shop.tenantId, owner(), shop.branchId, norte, 'TRASLADO', [{ variantId: a, quantity: 3 }]));

    const [out, entry] = (await linesOf(a)).slice(-2).sort((x, y) => (x.type < y.type ? 1 : -1)); // OUT primero
    expect(out).toMatchObject({ category: 'TRANSFER', type: 'OUT', reason: 'TRASLADO', quantity: 3, unitCost: 3, balanceAfter: 17, originBranchId: shop.branchId, destinationBranchId: null });
    expect(entry).toMatchObject({ category: 'TRANSFER', type: 'IN', reason: 'TRASLADO', quantity: 3, unitCost: 3, balanceAfter: 3, originBranchId: null, destinationBranchId: norte });
  });

  it('anulación de compra: categoría PURCHASE en sentido OUT, al costo de la compra, y deja el saldo en cero', async () => {
    const order = await new RegisterPurchaseHandler(db.manager, redisStub).execute(
      new RegisterPurchaseCommand(shop.tenantId, owner(), shop.supplierId, shop.branchId, 'F-2', [{ variantId: b, quantity: 4, purchasePrice: 5 }]),
    );
    expect(await lastLine(b)).toMatchObject({ category: 'PURCHASE', type: 'IN', unitCost: 5, balanceAfter: 4 });

    await new CancelPurchaseOrderHandler(db.manager, redisStub).execute(new CancelPurchaseOrderCommand(shop.tenantId, owner(), order.id));
    expect(await lastLine(b)).toMatchObject({ category: 'PURCHASE', type: 'OUT', reason: 'ANULACION_COMPRA', quantity: 4, unitCost: 5, balanceAfter: 0, purchaseOrderId: order.id });
    expect(purchaseId).toBeTruthy();
  });

  it('todas las líneas tienen categoría, costo y saldo, y se usaron las siete categorías', async () => {
    const all = await db.getRepository(InventoryMovement).find({ where: { tenantId: shop.tenantId } });

    expect(all.filter((m) => m.category === null || m.unitCost === null || m.balanceAfter === null)).toEqual([]);
    expect(new Set(all.map((m) => m.category))).toEqual(new Set(Object.values(InventoryMovementCategory)));
  });

  describe('comprobación de deriva (saldo del kardex contra la existencia)', () => {
    it('con todo registrado por los casos de uso, no hay ninguna anomalía', async () => {
      expect(await stockOf(a)).toBe(17);
      expect(await stockOf(a, norte)).toBe(3);
      expect(await drift()).toEqual([]);
    });

    it('detecta que la existencia cambió sin dejar movimiento', async () => {
      await db.query(`UPDATE product_stocks SET quantity = quantity + 1 WHERE branch_id = $1 AND variant_id = $2`, [shop.branchId, a]);

      expect(await drift()).toMatchObject([{ sku: 'KDX-A', problema: 'el saldo final no coincide con la existencia' }]);

      await db.query(`UPDATE product_stocks SET quantity = quantity - 1 WHERE branch_id = $1 AND variant_id = $2`, [shop.branchId, a]);
      expect(await drift()).toEqual([]);
    });

    it('detecta una cadena rota: un movimiento del medio con el saldo alterado', async () => {
      const middle = (await linesOf(a)).find((m) => m.reason === 'VENTA')!;
      await db.query(`UPDATE inventory_movements SET balance_after = balance_after + 100 WHERE id = $1`, [middle.id]);

      expect(await drift()).toMatchObject([{ sku: 'KDX-A', problema: expect.stringContaining('cadena rota') as string }]);

      await db.query(`UPDATE inventory_movements SET balance_after = balance_after - 100 WHERE id = $1`, [middle.id]);
      expect(await drift()).toEqual([]);
    });

    it('no depende del orden de las fechas: con las horas barajadas la cadena sigue cuadrando', async () => {
      await db.query(`UPDATE inventory_movements SET created_at = now() - (random() * interval '10 days') WHERE variant_id = $1`, [a]);

      expect(await drift()).toEqual([]);
    });
  });

  describe('historial', () => {
    const history = (filters: Partial<GetInventoryMovementsQuery['filters']>) =>
      new GetInventoryMovementsHandler(db.manager, redisStub).execute(new GetInventoryMovementsQuery(shop.tenantId, owner(), true, { page: 1, limit: 50, startDate: '2020-01-01', endDate: '2100-01-01', ...filters }));

    it('filtra por categoría y devuelve categoría, costo y saldo en cada fila', async () => {
      const transfers = await history({ category: InventoryMovementCategory.TRANSFER });
      expect(transfers.data).toHaveLength(2);
      expect(transfers.data.map((r) => [r.type, r.category, r.unitCost, r.balanceAfter]).sort()).toEqual([['IN', 'TRANSFER', 3, 3], ['OUT', 'TRANSFER', 3, 17]].sort());

      const sales = await history({ category: InventoryMovementCategory.SALE });
      expect(sales.data).toHaveLength(1);
      expect(sales.data[0]).toMatchObject({ reason: 'VENTA', category: 'SALE', unitCost: 3, balanceAfter: 12 });
    });

    it('sin filtro de categoría, trae todas', async () => {
      const everything = await history({});
      expect(new Set(everything.data.map((r) => r.category)).size).toBe(7);
    });
  });
});
