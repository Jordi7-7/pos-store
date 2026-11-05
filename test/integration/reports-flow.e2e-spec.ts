import { DataSource } from 'typeorm';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
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
import { GetSalesCostReportHandler } from '../../src/modules/reports/application/queries/get-sales-cost-report/get-sales-cost-report.handler';
import { GetSalesCostReportQuery } from '../../src/modules/reports/application/queries/get-sales-cost-report/get-sales-cost-report.query';
import { GetValuedInventoryHandler } from '../../src/modules/reports/application/queries/get-valued-inventory/get-valued-inventory.handler';
import { GetValuedInventoryQuery } from '../../src/modules/reports/application/queries/get-valued-inventory/get-valued-inventory.query';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Reportes del dueño con los handlers reales sobre Postgres: costo de ventas y existencias valuadas. */
describe('Reportes: costo de ventas y existencias valuadas', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let northBranchId: string;
  let sessionId: string;
  let cashierId: string;

  const day = (offsetDays = 0): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

  const buy = (variantId: string, quantity: number, purchasePrice: number, branchId = shop.branchId, tenant = shop) =>
    new RegisterPurchaseHandler(db.manager, redisStub).execute(
      new RegisterPurchaseCommand(tenant.tenantId, tenant.ownerId, tenant.supplierId, branchId, `F-${Math.random().toString(36).slice(2, 8)}`, [{ variantId, quantity, purchasePrice }]),
    );
  const cancelPurchase = (id: string) => new CancelPurchaseOrderHandler(db.manager, redisStub).execute(new CancelPurchaseOrderCommand(shop.tenantId, shop.ownerId, id));
  const sell = (variantId: string, quantity: number, price: number, discountAmount?: number) =>
    new ProcessSaleHandler(db.manager, redisStub).execute(
      new ProcessSaleCommand(
        shop.tenantId,
        shop.ownerId,
        shop.branchId,
        sessionId,
        undefined,
        [{ variantId, quantity, price }],
        [{ paymentMethod: PaymentMethod.EFECTIVO, amount: Math.max(0.01, price * quantity - (discountAmount ?? 0)) }],
        undefined,
        undefined,
        discountAmount,
      ),
    );
  const refund = (saleId: string, variantId: string, quantity: number) =>
    new ProcessRefundHandler(db.manager, redisStub).execute(new ProcessRefundCommand(shop.tenantId, shop.ownerId, shop.branchId, saleId, sessionId, 'prueba', [{ variantId, quantity }]));

  const costReport = (args: Partial<{ start: string; end: string; branchId: string; userId: string; isOwner: boolean; tenantId: string }> = {}) =>
    new GetSalesCostReportHandler(db.manager, redisStub).execute(
      new GetSalesCostReportQuery(args.tenantId ?? shop.tenantId, args.start ?? day(-1), args.end ?? day(1), args.branchId, args.userId ?? shop.ownerId, args.isOwner ?? true),
    );
  const inventory = (args: Partial<{ page: number; limit: number; branchId: string; userId: string; isOwner: boolean; tenantId: string }> = {}) =>
    new GetValuedInventoryHandler(db.manager, redisStub).execute(
      new GetValuedInventoryQuery(args.tenantId ?? shop.tenantId, args.page, args.limit, args.branchId, args.userId ?? shop.ownerId, args.isOwner ?? true),
    );

  beforeAll(async () => {
    database = await startTestDatabase('reports');
    db = database.db;
    shop = await seedTenant(db, 'reportes');
    other = await seedTenant(db, 'rep-ajena');
    northBranchId = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    cashierId = (await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-rep', password: 'x', isOwner: false }))).id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);

    const register = await db.getRepository(CashRegister).save(db.getRepository(CashRegister).create({ tenantId: shop.tenantId, branchId: shop.branchId, code: 1, name: 'Caja 1' }));
    sessionId = (
      await db.getRepository(CashSession).save(
        db.getRepository(CashSession).create({ branchId: shop.branchId, userId: shop.ownerId, cashRegisterId: register.id, openingBalance: 0, status: CashSessionStatus.OPEN, openedAt: new Date() }),
      )
    ).id;
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('costo de ventas', () => {
    it('los totales son exactos al centavo, sin artefactos de coma flotante', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'RPT-FLOAT');
      await buy(variantId, 10, 0.1);
      const sale = await sell(variantId, 3, 0.2);

      const row = (await costReport()).find((r) => r.id === sale.id);
      expect(row).toMatchObject({ pieces: 3, salePrice: 0.6, costPrice: 0.3, difference: 0.3 });
      expect(row?.items[0]).toMatchObject({ totalCost: 0.3, totalPrice: 0.6, profit: 0.3 });
    });

    it('descuenta de la venta y del costo las piezas devueltas, con el descuento en proporción', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'RPT-REFUND');
      await buy(variantId, 10, 4);
      const sale = await sell(variantId, 3, 10, 5); // total 25, costo 12
      await refund(sale.id, variantId, 1);

      const row = (await costReport()).find((r) => r.id === sale.id);
      // 2 piezas netas: 20 - (5 × 2/3 = 3.33) = 16.67 de venta; costo 8
      expect(row).toMatchObject({ status: 'PARTIALLY_REFUNDED', pieces: 2, salePrice: 16.67, costPrice: 8, difference: 8.67 });
      expect(row?.items[0]).toMatchObject({ quantity: 3, refundedQuantity: 1, netQuantity: 2, discountAmount: 3.33, profit: 8.67 });
    });

    it('una venta devuelta por completo ya no aparece', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'RPT-FULL');
      await buy(variantId, 5, 4);
      const sale = await sell(variantId, 2, 10);
      await refund(sale.id, variantId, 2);
      expect((await costReport()).map((r) => r.id)).not.toContain(sale.id);
    });

    it('filtra por rango de fechas en la zona horaria de la tienda', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'RPT-DATE');
      await buy(variantId, 5, 4);
      const old = await sell(variantId, 1, 10);
      await db.query(`UPDATE sales SET created_at = '2020-03-15T12:00:00Z' WHERE id = $1`, [old.id]);

      expect((await costReport()).map((r) => r.id)).not.toContain(old.id);
      expect((await costReport({ start: '2020-03-15', end: '2020-03-15' })).map((r) => r.id)).toEqual([old.id]);
    });

    it('un cliente sin nombre cae en CONSUMIDOR FINAL y el comprador indicado se muestra', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'RPT-BUYER');
      await buy(variantId, 5, 4);
      const sale = await sell(variantId, 1, 10);
      await db.query(`UPDATE sales SET customer_id = NULL WHERE id = $1`, [sale.id]);

      expect((await costReport()).find((r) => r.id === sale.id)?.clientName).toBe('CONSUMIDOR FINAL');
    });

    it('nunca trae ventas de otra tienda y puede acotarse por sucursal', async () => {
      const foreignVariant = await seedVariant(db, other.tenantId, 'RPT-AJENO');
      await buy(foreignVariant, 5, 4, other.branchId, other);
      expect(await costReport({ tenantId: other.tenantId, userId: other.ownerId })).toEqual([]);

      const inNorth = await costReport({ branchId: northBranchId });
      expect(inNorth).toEqual([]);
      expect((await costReport({ branchId: shop.branchId })).length).toBeGreaterThan(0);
    });

    it('un usuario que no es propietario debe indicar una sucursal suya', async () => {
      await expect(costReport({ userId: cashierId, isOwner: false })).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(costReport({ userId: cashierId, isOwner: false, branchId: northBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      await expect(costReport({ userId: cashierId, isOwner: false, branchId: shop.branchId })).resolves.toBeInstanceOf(Array);
    });
  });

  describe('existencias valuadas', () => {
    it('valora con el costo de cada lote que queda y da el costo medio por unidad', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'VAL-1');
      await buy(variantId, 10, 4);
      await buy(variantId, 10, 6);

      const { data, meta } = await inventory({ limit: 100 });
      expect(data.find((row) => row.sku === 'VAL-1')).toMatchObject({ quantity: 20, purchasePrice: 5, totalValue: 100 });
      expect(meta.totalQuantity).toBeGreaterThanOrEqual(20);
    });

    it('lo vendido sale por orden FIFO: solo vale lo que queda de cada lote', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'VAL-FIFO');
      await buy(variantId, 10, 4);
      await buy(variantId, 10, 6);
      await sell(variantId, 12, 20); // 10 del lote a 4 y 2 del lote a 6

      const row = (await inventory({ limit: 100 })).data.find((r) => r.sku === 'VAL-FIFO');
      expect(row).toMatchObject({ quantity: 8, purchasePrice: 6, totalValue: 48 });
    });

    it('una compra anulada deja de contar: se valora con los lotes vigentes', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'VAL-2');
      await buy(variantId, 10, 4);
      const second = await buy(variantId, 10, 9);
      await cancelPurchase(second.id);

      const row = (await inventory({ limit: 100 })).data.find((r) => r.sku === 'VAL-2');
      expect(row).toMatchObject({ quantity: 10, purchasePrice: 4, totalValue: 40 });
    });

    it('sin sucursal suma todas; con sucursal, solo su stock y los lotes de esa sucursal', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'VAL-3');
      await buy(variantId, 4, 5, shop.branchId);
      await buy(variantId, 6, 7, northBranchId);

      const all = (await inventory({ limit: 100 })).data.find((r) => r.sku === 'VAL-3');
      expect(all).toMatchObject({ quantity: 10, totalValue: 62, purchasePrice: 6.2 });
      const north = (await inventory({ branchId: northBranchId, limit: 100 })).data.find((r) => r.sku === 'VAL-3');
      expect(north).toMatchObject({ quantity: 6, purchasePrice: 7, totalValue: 42 });
      const main = (await inventory({ branchId: shop.branchId, limit: 100 })).data.find((r) => r.sku === 'VAL-3');
      expect(main).toMatchObject({ quantity: 4, purchasePrice: 5, totalValue: 20 });
    });

    it('las unidades en stock sin lote (datos antiguos) se valoran al costo vigente', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'VAL-LEGACY', { purchasePrice: 4 });
      await db.query(`INSERT INTO product_stocks (branch_id, variant_id, quantity) VALUES ($1, $2, 5)`, [shop.branchId, variantId]);

      const row = (await inventory({ limit: 1000 })).data.find((r) => r.sku === 'VAL-LEGACY');
      expect(row).toMatchObject({ quantity: 5, purchasePrice: 4, totalValue: 20 });
    });

    it('una venta sin stock deja cantidad negativa valorada al costo vigente', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'VAL-DEBT', { purchasePrice: 4 });
      await sell(variantId, 3, 10);

      const row = (await inventory({ limit: 1000 })).data.find((r) => r.sku === 'VAL-DEBT');
      expect(row).toMatchObject({ quantity: -3, totalValue: -12 });
    });

    it('sin atributos, el nombre es el del producto', async () => {
      const row = (await inventory({ limit: 1000 })).data.find((r) => r.sku === 'VAL-1');
      expect(row?.name).toBe('VAL-1');
    });

    it('los totales cubren todas las variantes con stock, no solo la página', async () => {
      const everything = await inventory({ limit: 1000 });
      const expectedValue = everything.data.reduce((sum, row) => sum + Math.round(row.totalValue * 100), 0) / 100;
      const firstPage = await inventory({ page: 1, limit: 2 });

      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.meta).toMatchObject({ total: everything.meta.total, page: 1, limit: 2, totalValue: expectedValue });
      expect(firstPage.meta.totalPages).toBe(Math.ceil(everything.meta.total / 2));
    });

    it('las variantes sin existencias no aparecen', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'VAL-ZERO');
      const purchase = await buy(variantId, 3, 4);
      await cancelPurchase(purchase.id);
      expect((await inventory({ limit: 1000 })).data.map((r) => r.sku)).not.toContain('VAL-ZERO');
    });

    it('nunca mezcla variantes de otra tienda', async () => {
      const foreignVariant = await seedVariant(db, other.tenantId, 'VAL-AJENO');
      await buy(foreignVariant, 5, 4, other.branchId, other);
      expect((await inventory({ limit: 1000 })).data.map((r) => r.sku)).not.toContain('VAL-AJENO');
      const foreignSkus = (await inventory({ tenantId: other.tenantId, userId: other.ownerId, limit: 1000 })).data.map((r) => r.sku);
      expect(foreignSkus).toContain('VAL-AJENO');
      expect(foreignSkus.some((sku) => sku.startsWith('VAL-') && sku !== 'VAL-AJENO')).toBe(false);
    });

    it('un usuario que no es propietario debe indicar una sucursal suya', async () => {
      await expect(inventory({ userId: cashierId, isOwner: false })).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(inventory({ userId: cashierId, isOwner: false, branchId: northBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    });
  });
});

