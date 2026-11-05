import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RedisService } from '../../src/common/redis/redis.service';
import { databaseConnectionOptions } from '../../src/config/database.options';
import { AdjustStockCommand } from '../../src/modules/products/application/commands/adjust-stock/adjust-stock.command';
import { AdjustStockHandler } from '../../src/modules/products/application/commands/adjust-stock/adjust-stock.handler';
import { Batch } from '../../src/modules/batches/domain/entities/batch.entity';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../src/modules/products/domain/entities/product-batch.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { CloseCashSessionCommand } from '../../src/modules/sales/application/commands/close-cash-session/close-cash-session.command';
import { CloseCashSessionHandler } from '../../src/modules/sales/application/commands/close-cash-session/close-cash-session.handler';
import { ProcessRefundCommand } from '../../src/modules/sales/application/commands/process-refund/process-refund.command';
import { ProcessRefundHandler } from '../../src/modules/sales/application/commands/process-refund/process-refund.handler';
import { ProcessSaleCommand, SaleItemInput } from '../../src/modules/sales/application/commands/process-sale/process-sale.command';
import { ProcessSaleHandler } from '../../src/modules/sales/application/commands/process-sale/process-sale.handler';
import { CashRegister } from '../../src/modules/sales/domain/entities/cash-register.entity';
import { CashSession } from '../../src/modules/sales/domain/entities/cash-session.entity';
import { PaymentMethod } from '../../src/modules/sales/domain/entities/sale-payment.entity';
import { Sale } from '../../src/modules/sales/domain/entities/sale.entity';
import { CashSessionStatus } from '../../src/modules/sales/domain/enums/cash-session-status.enum';
import { DashboardReadQueries } from '../../src/modules/dashboard/application/queries/get-dashboard-metrics/dashboard-read-queries';
import { GetDashboardMetricsHandler } from '../../src/modules/dashboard/application/queries/get-dashboard-metrics/get-dashboard-metrics.handler';
import { GetDashboardMetricsQuery } from '../../src/modules/dashboard/application/queries/get-dashboard-metrics/get-dashboard-metrics.query';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';

/**
 * Recorre ventas, devoluciones y cierre de caja con los handlers reales sobre Postgres.
 * Crea una base de datos propia con nombre único, aplica todas las migraciones y la borra
 * al terminar: nunca toca la base configurada en DB_DATABASE.
 */
describe('Flujo de dinero: venta, devolución y cierre de caja', () => {
  const databaseName = `pos_store_it_${process.pid}_${Date.now()}`;
  const redis = { get: () => Promise.resolve(null), set: () => Promise.resolve() } as unknown as RedisService;

  let admin: DataSource;
  let db: DataSource;
  let tenantId: string;
  let branchId: string;
  let userId: string;
  let variantId: string;
  let cashRegisterId: string;

  const adminConnection = (): DataSource =>
    new DataSource({ ...databaseConnectionOptions(), database: 'postgres', entities: [] });

  async function openSession(openingBalance: number): Promise<string> {
    const session = await db.getRepository(CashSession).save(
      db.getRepository(CashSession).create({
        branchId,
        userId,
        cashRegisterId,
        openingBalance,
        status: CashSessionStatus.OPEN,
        openedAt: new Date(),
      }),
    );
    return session.id;
  }

  const sell = (cashSessionId: string, items: SaleItemInput[], paid: number, discountAmount?: number): Promise<Sale> =>
    new ProcessSaleHandler(db.manager, redis).execute(
      new ProcessSaleCommand(
        tenantId,
        userId,
        branchId,
        cashSessionId,
        undefined,
        items,
        [{ paymentMethod: PaymentMethod.EFECTIVO, amount: paid }],
        undefined,
        undefined,
        discountAmount,
      ),
    );

  const refund = (saleId: string, cashSessionId: string, quantity: number) =>
    new ProcessRefundHandler(db.manager, redis).execute(
      new ProcessRefundCommand(tenantId, userId, branchId, saleId, cashSessionId, 'Prueba', [{ variantId, quantity }]),
    );

  const stockQuantity = async (): Promise<number> =>
    (await db.getRepository(ProductStock).findOneByOrFail({ branchId, variantId })).quantity;

  const saleById = (id: string): Promise<Sale> =>
    db.getRepository(Sale).findOneOrFail({ where: { id }, relations: { items: true, payments: true } });

  beforeAll(async () => {
    dotenv.config();
    admin = await adminConnection().initialize();
    await admin.query(`CREATE DATABASE "${databaseName}"`);

    db = await new DataSource({
      ...databaseConnectionOptions(),
      database: databaseName,
      migrations: [path.join(__dirname, '../../src/database/migrations/*.ts')],
    }).initialize();
    await db.runMigrations();

    const tenant = await db.getRepository(Tenant).save(
      db.getRepository(Tenant).create({
        name: 'Tienda',
        ruc: '0999999999001',
        country: 'EC',
        currencyCode: 'USD',
        currencySymbol: '$',
        slug: 'tienda',
      }),
    );
    tenantId = tenant.id;

    const branch = await db.getRepository(Branch).save(
      db.getRepository(Branch).create({ tenantId, name: 'Matriz', address: 'Centro', code: 1 }),
    );
    branchId = branch.id;

    const user = await db.getRepository(User).save(
      db.getRepository(User).create({ tenantId, name: 'Dueño', username: 'owner', password: 'x', isOwner: true }),
    );
    userId = user.id;

    const register = await db.getRepository(CashRegister).save(
      db.getRepository(CashRegister).create({ tenantId, branchId, code: 1, name: 'Caja 1' }),
    );
    cashRegisterId = register.id;

    const product = await db.getRepository(Product).save(
      db.getRepository(Product).create({ tenantId, name: 'Camisa', description: 'Camisa' }),
    );
    const variant = await db.getRepository(ProductVariant).save(
      db.getRepository(ProductVariant).create({
        productId: product.id,
        tenantId,
        sku: 'CAM-1',
        barcode: '1',
        purchasePrice: 4,
        salePrice: 10,
      }),
    );
    variantId = variant.id;

    await db.getRepository(ProductStock).save(db.getRepository(ProductStock).create({ branchId, variantId, quantity: 20 }));
    const batch = await db.getRepository(Batch).save(db.getRepository(Batch).create({ tenantId, branchId, code: 'L1' }));
    await db.getRepository(ProductBatch).save(
      db.getRepository(ProductBatch).create({
        tenantId,
        branchId,
        batchId: batch.id,
        variantId,
        initialQuantity: 20,
        remainingQuantity: 20,
        unitCost: 4,
      }),
    );
  }, 60000);

  afterAll(async () => {
    await db?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  it('una venta con devoluciones parciales y cierre deja dinero, stock y kardex cuadrados', async () => {
    const sessionId = await openSession(50);

    // Misma variante en dos líneas con precios distintos, y descuento global
    const created = await sell(
      sessionId,
      [
        { variantId, quantity: 1, price: 10 },
        { variantId, quantity: 2, price: 8 },
      ],
      21,
      5,
    );

    const sale = await saleById(created.id);
    expect(sale).toMatchObject({ subtotal: 26, globalDiscountAmount: 5, discountAmount: 5, total: 21, status: 'COMPLETED' });
    expect(sale.invoiceNumber).toBe('001-001-000000001');
    expect(sale.items.reduce((sum, item) => sum + item.total * 100, 0) / 100).toBe(21);
    expect(sale.items.reduce((sum, item) => sum + item.globalDiscountAmount * 100, 0) / 100).toBe(5);
    expect(await stockQuantity()).toBe(17);
    expect((await db.getRepository(CashRegister).findOneByOrFail({ id: cashRegisterId })).nextInvoiceNumber).toBe(2);

    // La devolución cruza las dos líneas de la variante
    const firstRefund = await refund(sale.id, sessionId, 2);
    expect((await saleById(sale.id)).status).toBe('PARTIALLY_REFUNDED');
    expect(await stockQuantity()).toBe(19);

    const lastRefund = await refund(sale.id, sessionId, 1);
    expect((await saleById(sale.id)).status).toBe('REFUNDED');
    expect(await stockQuantity()).toBe(20);

    // Se devuelve exactamente lo que se cobró, ni un céntimo más o menos
    expect(Math.round((firstRefund.totalRefunded + lastRefund.totalRefunded) * 100) / 100).toBe(21);

    await expect(refund(sale.id, sessionId, 1)).rejects.toThrow(/ya ha sido devuelta/);

    const closed = await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 49.5));
    expect(closed).toMatchObject({ expectedBalance: 50, closingBalance: 49.5, difference: -0.5, status: CashSessionStatus.CLOSED });

    const movements = await db.getRepository(InventoryMovement).findBy({ tenantId, variantId });
    expect(movements).toHaveLength(2 + 3);
  });

  it('devolver una a una unidades que no dividen exacto suma lo cobrado', async () => {
    const sessionId = await openSession(0);
    const sale = await sell(sessionId, [{ variantId, quantity: 3, price: 3.333 }], 10);
    expect(sale.total).toBe(10);

    const refunds = [await refund(sale.id, sessionId, 1), await refund(sale.id, sessionId, 1), await refund(sale.id, sessionId, 1)];

    expect(refunds.map((item) => item.totalRefunded)).toEqual([3.33, 3.34, 3.33]);

    await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 0));
  });

  it('solo puede haber una sesión abierta por caja', async () => {
    const sessionId = await openSession(0);

    await expect(openSession(0)).rejects.toThrow(/UQ_cash_sessions_open_per_register/);

    await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 0));
  });

  it('un pago insuficiente no deja rastro: ni venta, ni stock, ni número de factura', async () => {
    const sessionId = await openSession(0);
    const stockBefore = await stockQuantity();
    const salesBefore = await db.getRepository(Sale).count();
    const registerBefore = await db.getRepository(CashRegister).findOneByOrFail({ id: cashRegisterId });

    await expect(sell(sessionId, [{ variantId, quantity: 1, price: 10 }], 9.99)).rejects.toThrow(/menor al total/);

    expect(await stockQuantity()).toBe(stockBefore);
    expect(await db.getRepository(Sale).count()).toBe(salesBefore);
    expect((await db.getRepository(CashRegister).findOneByOrFail({ id: cashRegisterId })).nextInvoiceNumber).toBe(
      registerBefore.nextInvoiceNumber,
    );

    await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 0));
  });

  describe('dashboard', () => {
    const metrics = (scopeBranchId?: string) =>
      new GetDashboardMetricsHandler(db.manager, new DashboardReadQueries(db.manager)).execute(
        new GetDashboardMetricsQuery(tenantId, scopeBranchId),
      );

    it('refleja una venta y una devolución del día en todas las secciones del panel', async () => {
      const before = await metrics(branchId);
      const sessionId = await openSession(0);
      try {
        const sale = await sell(sessionId, [{ variantId, quantity: 2, price: 10 }], 20);
        await refund(sale.id, sessionId, 1);
        const after = await metrics(branchId);

        expect(after.today.totalSales - before.today.totalSales).toBe(20);
        expect(after.today.itemsCount - before.today.itemsCount).toBe(2);
        expect(after.today.refunds.totalRefunded - before.today.refunds.totalRefunded).toBe(10);
        expect(after.today.refunds.count - before.today.refunds.count).toBe(1);
        expect(after.today.netSales).toBe(Math.max(0, after.today.totalSales - after.today.refunds.totalRefunded));
        expect(after.paymentMethods.cash.amount - before.paymentMethods.cash.amount).toBe(20);
        expect(after.weekSummary.totalWeek - before.weekSummary.totalWeek).toBe(20);
        expect(after.topProducts.map((product) => product.sku)).toContain('CAM-1');
        expect(Array.isArray(after.lowStockProducts)).toBe(true);
        expect(Array.isArray(after.yesterdaySoldProducts)).toBe(true);

        // Sin sucursal agrega todas las del tenant
        expect((await metrics()).today.totalSales).toBe(after.today.totalSales);
      } finally {
        await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 10));
      }
    });

    it('una zona horaria inválida guardada en el tenant no rompe el panel ni llega al SQL', async () => {
      await db.getRepository(Tenant).update({ id: tenantId }, { timezone: "UTC'; SELECT 1; --" });

      await expect(metrics(branchId)).resolves.toBeDefined();

      await db.getRepository(Tenant).update({ id: tenantId }, { timezone: 'America/Guayaquil' });
    });
  });

  describe('stock', () => {
    const newVariant = async (sku: string): Promise<string> => {
      const product = await db.getRepository(Product).save(
        db.getRepository(Product).create({ tenantId, name: sku, description: sku }),
      );
      const variant = await db.getRepository(ProductVariant).save(
        db.getRepository(ProductVariant).create({
          productId: product.id,
          tenantId,
          sku,
          barcode: sku,
          purchasePrice: 4,
          salePrice: 10,
        }),
      );
      return variant.id;
    };

    const adjust = (id: string, quantity: number, type: 'IN' | 'OUT') =>
      new AdjustStockHandler(db.manager, redis).execute(new AdjustStockCommand(tenantId, userId, branchId, id, quantity, type));

    const quantityOf = async (id: string): Promise<number> =>
      (await db.getRepository(ProductStock).findOneByOrFail({ branchId, variantId: id })).quantity;

    it('entradas simultáneas sobre una variante sin stock no chocan ni pierden unidades', async () => {
      const id = await newVariant('SIN-STOCK');

      await Promise.all([1, 2, 3, 4, 5].map(() => adjust(id, 2, 'IN')));

      expect(await quantityOf(id)).toBe(10);
    });

    it('ventas simultáneas descuentan todas las unidades y numeran sin repetir', async () => {
      const id = await newVariant('CONCURRENTE');
      await adjust(id, 10, 'IN');
      const sessionId = await openSession(0);

      const sales = await Promise.all([1, 2, 3, 4].map(() => sell(sessionId, [{ variantId: id, quantity: 2, price: 10 }], 20)));

      expect(await quantityOf(id)).toBe(2);
      expect(new Set(sales.map((sale) => sale.invoiceNumber)).size).toBe(4);
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 80));
    });

    it('ventas simultáneas con los mismos productos en orden cruzado no se bloquean entre sí', async () => {
      const a = await newVariant('CRUZADO-A');
      const b = await newVariant('CRUZADO-B');
      await adjust(a, 50, 'IN');
      await adjust(b, 50, 'IN');
      const sessionId = await openSession(0);
      const forward = [{ variantId: a, quantity: 1, price: 10 }, { variantId: b, quantity: 1, price: 10 }];
      const backward = [...forward].reverse();

      await Promise.all(
        Array.from({ length: 10 }, (_, i) => sell(sessionId, i % 2 === 0 ? forward : backward, 20)),
      );

      expect(await quantityOf(a)).toBe(40);
      expect(await quantityOf(b)).toBe(40);
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 200));
    });

    it('vender sin stock lo deja negativo y la siguiente entrada salda la deuda', async () => {
      const id = await newVariant('NEGATIVO');
      const sessionId = await openSession(0);

      const sale = await sell(sessionId, [{ variantId: id, quantity: 3, price: 10 }], 30);

      expect(await quantityOf(id)).toBe(-3);
      expect(sale.items[0].cost).toBe(4); // sin lotes: costo de ficha

      await adjust(id, 5, 'IN');

      expect(await quantityOf(id)).toBe(2);
      const batches = await db.getRepository(ProductBatch).findBy({ variantId: id });
      expect(batches.map((batch) => batch.remainingQuantity)).toEqual([2]);
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 30));
    });

    it('un ajuste de salida no puede dejar el stock en negativo', async () => {
      const id = await newVariant('AJUSTE');
      await adjust(id, 1, 'IN');

      await expect(adjust(id, 2, 'OUT')).rejects.toThrow(/Stock insuficiente/);

      expect(await quantityOf(id)).toBe(1);
    });

    it('el costo de la venta sigue el orden FIFO de los lotes', async () => {
      const id = await newVariant('FIFO');
      const batchRepo = db.getRepository(ProductBatch);
      await adjust(id, 2, 'IN');
      await db.getRepository(ProductVariant).update(id, { purchasePrice: 8 });
      await adjust(id, 2, 'IN');
      const sessionId = await openSession(0);

      const sale = await sell(sessionId, [{ variantId: id, quantity: 3, price: 10 }], 30);

      expect(sale.items[0].cost).toBe(5.33); // (2 x 4 + 1 x 8) / 3
      const remaining = (await batchRepo.find({ where: { variantId: id }, order: { createdAt: 'ASC' } })).map(
        (batch) => batch.remainingQuantity,
      );
      expect(remaining).toEqual([0, 1]);
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 30));
    });
  });
});
