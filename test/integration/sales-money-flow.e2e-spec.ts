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
import { GetCashSessionsHandler } from '../../src/modules/sales/application/queries/get-cash-sessions/get-cash-sessions.handler';
import { GetCashSessionsQuery } from '../../src/modules/sales/application/queries/get-cash-sessions/get-cash-sessions.query';
import { GetCashSessionDetailsHandler } from '../../src/modules/sales/application/queries/get-cash-session-details/get-cash-session-details.handler';
import { GetCashSessionDetailsQuery } from '../../src/modules/sales/application/queries/get-cash-session-details/get-cash-session-details.query';
import { Expense } from '../../src/modules/sales/domain/entities/expense.entity';
import { Refund } from '../../src/modules/sales/domain/entities/refund.entity';
import { GetProductSalesReportHandler } from '../../src/modules/reports/application/queries/get-product-sales-report/get-product-sales-report.handler';
import { GetProductSalesReportQuery } from '../../src/modules/reports/application/queries/get-product-sales-report/get-product-sales-report.query';
import { CreateUserCommand } from '../../src/modules/users/application/commands/create-user/create-user.command';
import { CreateUserHandler } from '../../src/modules/users/application/commands/create-user/create-user.handler';
import { Role } from '../../src/modules/roles/domain/entities/role.entity';
import { UpdateUserCommand } from '../../src/modules/users/application/commands/update-user/update-user.command';
import { UpdateUserHandler } from '../../src/modules/users/application/commands/update-user/update-user.handler';
import { HashService } from '../../src/modules/auth/services/hash.service';
import { AuthTokenService } from '../../src/modules/auth/services/auth-token.service';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';

/**
 * Recorre ventas, devoluciones y cierre de caja con los handlers reales sobre Postgres.
 * Crea una base de datos propia con nombre único, aplica todas las migraciones y la borra
 * al terminar: nunca toca la base configurada en DB_DATABASE.
 */
describe('Flujo de dinero: venta, devolución y cierre de caja', () => {
  const databaseName = `pos_store_it_${process.pid}_${Date.now()}`;
  const redis = { get: () => Promise.resolve(null), set: () => Promise.resolve(), del: () => Promise.resolve() } as unknown as RedisService;

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

  it('el listado de sesiones suma ventas menos devoluciones solo de cada sesión', async () => {
    const sessionId = await openSession(0);
    try {
      const sale = await sell(sessionId, [{ variantId, quantity: 3, price: 10 }], 30);
      await refund(sale.id, sessionId, 1);

      const list = await new GetCashSessionsHandler(db.manager, redis).execute(
        new GetCashSessionsQuery(tenantId, branchId, userId, true),
      );
      const item = list.find((session) => session.id === sessionId);

      expect(item).toMatchObject({
        status: CashSessionStatus.OPEN,
        totalSales: 20,
        closingBalance: null,
        branch: { id: branchId, name: 'Matriz' },
        cashRegister: { id: cashRegisterId, name: 'Caja 1', code: 1 },
        user: { id: userId, name: 'Dueño' },
      });
      expect(list.length).toBeLessThanOrEqual(100);
    } finally {
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 20));
    }
  });

  describe('efectivo esperado en caja', () => {
    const details = (sessionId: string) =>
      new GetCashSessionDetailsHandler(db.getRepository(CashSession), db.getRepository(Sale), db.getRepository(Expense), db.getRepository(Refund)).execute(
        new GetCashSessionDetailsQuery(tenantId, sessionId),
      );
    const sellWith = (sessionId: string, quantity: number, payments: Array<{ paymentMethod: PaymentMethod; amount: number }>) =>
      new ProcessSaleHandler(db.manager, redis).execute(
        new ProcessSaleCommand(tenantId, userId, branchId, sessionId, undefined, [{ variantId, quantity, price: 10 }], payments),
      );

    it('el vuelto no cuenta como ingreso: pagar 50 una venta de 30 registra 30 y el esperado sube 30', async () => {
      const sessionId = await openSession(100);
      const sale = await sellWith(sessionId, 3, [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 50 }]);

      expect((await saleById(sale.id)).payments.map((p) => p.amount)).toEqual([30]);
      expect((await details(sessionId)).session.expectedBalance).toBe(130);
      const closed = await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 130));
      expect(closed).toMatchObject({ expectedBalance: 130, difference: 0 });
    });

    it('pago mixto: la tarjeta no entra al efectivo y el efectivo solo cubre el resto', async () => {
      const sessionId = await openSession(0);
      await sellWith(sessionId, 4, [
        { paymentMethod: PaymentMethod.TARJETA, amount: 25 },
        { paymentMethod: PaymentMethod.EFECTIVO, amount: 20 },
      ]);

      const { kpis, session } = await details(sessionId);
      expect(kpis).toMatchObject({ grossSales: 40, cashSales: 15, cardSales: 25 });
      expect(session.expectedBalance).toBe(15);
      expect(await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 15))).toMatchObject({ expectedBalance: 15 });
    });

    it('el cierre y el detalle coinciden también con una venta antigua sin pagos registrados (cuenta como efectivo)', async () => {
      const sessionId = await openSession(10);
      const legacy = await sellWith(sessionId, 2, [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 20 }]);
      await sellWith(sessionId, 1, [{ paymentMethod: PaymentMethod.TARJETA, amount: 10 }]);
      await db.query(`DELETE FROM sale_payments WHERE sale_id = $1`, [legacy.id]);

      const shown = (await details(sessionId)).session.expectedBalance;
      const closed = await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 30));
      expect(shown).toBe(30); // 10 apertura + 20 de la venta antigua
      expect(closed.expectedBalance).toBe(shown);
    });
  });

  it('el detalle de la sesión resume ventas, devoluciones y gastos con el arqueo esperado', async () => {
    const sessionId = await openSession(100);
    try {
      const sale = await sell(sessionId, [{ variantId, quantity: 3, price: 10 }], 30);
      await refund(sale.id, sessionId, 1);
      await db.getRepository(Expense).save(
        db.getRepository(Expense).create({ tenantId, branchId, cashSessionId: sessionId, userId, description: 'Bolsas', amount: 5, category: 'OTROS' }),
      );

      const handler = new GetCashSessionDetailsHandler(
        db.getRepository(CashSession),
        db.getRepository(Sale),
        db.getRepository(Expense),
        db.getRepository(Refund),
      );
      const details = await handler.execute(new GetCashSessionDetailsQuery(tenantId, sessionId));

      expect(details.kpis).toEqual({
        grossSales: 30,
        netSales: 20,
        cashSales: 30,
        cardSales: 0,
        totalExpenses: 5,
        totalRefunds: 10,
        salesCount: 1,
        expensesCount: 1,
        refundsCount: 1,
      });
      // 100 apertura + 30 ventas en efectivo - 5 gastos - 10 devolución
      expect(details.session).toMatchObject({ openingBalance: 100, closingBalance: null, expectedBalance: 115, difference: null });
      expect(details.sales[0]).toMatchObject({ id: sale.id, total: 30, customerName: 'CONSUMIDOR FINAL', totalItems: 3 });
      expect(details.refunds[0]).toMatchObject({ totalRefunded: 10, sale: { id: sale.id } });
      expect(details.expenses[0]).toMatchObject({ amount: 5, description: 'Bolsas' });
    } finally {
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 115));
    }
  });

  it('el reporte de ventas por producto trae solo lo vendido, con su stock y precio efectivo', async () => {
    const product = await db.getRepository(Product).save(
      db.getRepository(Product).create({ tenantId, name: 'Gorra', description: 'Gorra' }),
    );
    const variant = await db.getRepository(ProductVariant).save(
      db.getRepository(ProductVariant).create({ productId: product.id, tenantId, sku: 'REP-1', barcode: 'REP-1', purchasePrice: 4, salePrice: 10 }),
    );
    await db.getRepository(ProductStock).save(db.getRepository(ProductStock).create({ branchId, variantId: variant.id, quantity: 10 }));

    const sessionId = await openSession(0);
    try {
      await sell(sessionId, [{ variantId: variant.id, quantity: 4, price: 10 }], 38, 2);

      const rows = await new GetProductSalesReportHandler(db.manager, redis).execute(
        new GetProductSalesReportQuery(tenantId, undefined, undefined, branchId, userId, true),
      );
      const mine = rows.filter((row) => row.sku === 'REP-1');

      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ name: 'Gorra', soldQuantity: 4, currentStock: 6, salePrice: 9.5, totalRevenue: 38 });
      expect(rows.every((row) => row.soldQuantity > 0)).toBe(true);
    } finally {
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 38));
    }
  });

  it('el detalle de la sesión carga todos los ítems y pagos de cada venta (varias líneas y varios pagos)', async () => {
    const sessionId = await openSession(0);
    try {
      const sale = await new ProcessSaleHandler(db.manager, redis).execute(
        new ProcessSaleCommand(
          tenantId,
          userId,
          branchId,
          sessionId,
          undefined,
          [
            { variantId, quantity: 1, price: 10 },
            { variantId, quantity: 2, price: 8 },
          ],
          [
            { paymentMethod: PaymentMethod.EFECTIVO, amount: 6 },
            { paymentMethod: PaymentMethod.TARJETA, amount: 20 },
          ],
        ),
      );

      const handler = new GetCashSessionDetailsHandler(
        db.getRepository(CashSession),
        db.getRepository(Sale),
        db.getRepository(Expense),
        db.getRepository(Refund),
      );
      const details = await handler.execute(new GetCashSessionDetailsQuery(tenantId, sessionId));
      const detail = details.sales.find((item) => item.id === sale.id);

      expect(detail?.items).toHaveLength(2);
      expect(detail?.items?.map((item) => Number(item.quantity)).sort()).toEqual([1, 2]);
      expect(detail?.items?.every((item) => item.variant?.sku === 'CAM-1' && item.variant.product?.name === 'Camisa')).toBe(true);
      expect(detail?.payments).toHaveLength(2);
      expect(details.kpis).toMatchObject({ grossSales: 26, cashSales: 6, cardSales: 20, salesCount: 1 });
    } finally {
      await new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(tenantId, sessionId, 6));
    }
  });

  describe('update-user', () => {
    const revoked: string[] = [];
    const handler = () =>
      new UpdateUserHandler(
        db.manager,
        new HashService(),
        redis,
        { revokeSession: (id: string) => Promise.resolve(void revoked.push(id)) } as unknown as AuthTokenService,
      );
    const branchesOf = async (id: string): Promise<string[]> =>
      (await db.query<Array<{ branch_id: string }>>(`SELECT branch_id FROM user_branches WHERE user_id = $1`, [id])).map((row) => row.branch_id);

    it('reasigna sucursales con un solo INSERT real y el usuario sigue activo', async () => {
      const second = await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId, name: 'Sucursal 2', address: 'Norte', code: 2 }));
      const cashier = await db.getRepository(User).save(
        db.getRepository(User).create({ tenantId, name: 'Cajera', username: 'cajera', password: 'x', isOwner: false }),
      );

      const updated = await handler().execute(new UpdateUserCommand(tenantId, cashier.id, { branchIds: [branchId, second.id] }, userId));

      expect(updated.isActive).toBe(true);
      expect((await branchesOf(cashier.id)).sort()).toEqual([branchId, second.id].sort());

      // Reemplazo, no suma: dejar una sola sucursal quita la otra
      await handler().execute(new UpdateUserCommand(tenantId, cashier.id, { branchIds: [second.id] }, userId));
      expect(await branchesOf(cashier.id)).toEqual([second.id]);
    });

    it('la respuesta nunca incluye el hash de la contraseña ni del PIN', async () => {
      const cashier = await db.getRepository(User).save(
        db.getRepository(User).create({ tenantId, name: 'Rosa', username: 'rosa', password: 'x', isOwner: false }),
      );

      const updated = await handler().execute(
        new UpdateUserCommand(tenantId, cashier.id, { password: 'clave-nueva-123', pin: '482915', branchIds: [branchId] }, userId),
      );

      expect(JSON.parse(JSON.stringify(updated))).not.toHaveProperty('password');
      expect(JSON.parse(JSON.stringify(updated))).not.toHaveProperty('pin');
    });

    it('una sucursal de otro tenant se rechaza y no deja cambios a medias', async () => {
      const cashier = await db.getRepository(User).save(
        db.getRepository(User).create({ tenantId, name: 'Luis', username: 'luis', password: 'x', isOwner: false }),
      );
      await handler().execute(new UpdateUserCommand(tenantId, cashier.id, { branchIds: [branchId] }, userId));

      await expect(
        handler().execute(new UpdateUserCommand(tenantId, cashier.id, { name: 'Cambiado', branchIds: ['00000000-0000-4000-8000-000000000000'] }, userId)),
      ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });

      expect((await db.getRepository(User).findOneByOrFail({ id: cashier.id })).name).toBe('Luis');
      expect(await branchesOf(cashier.id)).toEqual([branchId]);
    });

    it('desactivar a un usuario revoca su sesión y dejarlo sin sucursales lo desactiva', async () => {
      const cashier = await db.getRepository(User).save(
        db.getRepository(User).create({ tenantId, name: 'Eva', username: 'eva', password: 'x', isOwner: false }),
      );
      revoked.length = 0;

      const updated = await handler().execute(new UpdateUserCommand(tenantId, cashier.id, { branchIds: [] }, userId));

      expect(updated.isActive).toBe(false);
      expect(revoked).toEqual([cashier.id]);
    });
  });

  describe('create-user', () => {
    const create = (overrides: Partial<{ username: string; email: string; pin: string; roleId: string; branchIds: string[]; password: string }> = {}) =>
      new CreateUserHandler(db.manager, new HashService()).execute(
        new CreateUserCommand(
          tenantId,
          'Nuevo',
          overrides.username ?? 'nuevo',
          overrides.password ?? 'clave-segura-1',
          overrides.email,
          overrides.pin,
          overrides.roleId,
          undefined,
          overrides.branchIds ?? [branchId],
        ),
      );
    const exists = (username: string): Promise<boolean> => db.getRepository(User).existsBy({ tenantId, username });

    let cashierRoleId: string;
    beforeAll(async () => {
      const role = await db.getRepository(Role).save(
        db.getRepository(Role).create({ tenantId, name: 'Cajero', permissions: [], isSystem: true }),
      );
      cashierRoleId = role.id;
    });

    it('crea el usuario con sus sucursales, el rol Cajero por defecto y sin exponer hashes', async () => {
      const created = await create({ username: '  Maria.Lopez ', email: ' Maria@Tienda.com ', pin: '735190' });

      expect(created).toMatchObject({ username: 'maria.lopez', email: 'maria@tienda.com', isOwner: false, isActive: true, roleId: cashierRoleId });
      expect(JSON.parse(JSON.stringify(created))).not.toHaveProperty('password');
      expect(JSON.parse(JSON.stringify(created))).not.toHaveProperty('pin');

      const stored = await db.getRepository(User).createQueryBuilder('user').addSelect(['user.password', 'user.pin']).where('user.id = :id', { id: created.id }).getOneOrFail();
      expect(stored.password).not.toBe('clave-segura-1');
      expect(await new HashService().compare('clave-segura-1', stored.password ?? '')).toBe(true);
      expect(await new HashService().compare('735190', stored.pin ?? '')).toBe(true);
      expect(await db.query<Array<{ branch_id: string }>>(`SELECT branch_id FROM user_branches WHERE user_id = $1`, [created.id])).toEqual([{ branch_id: branchId }]);
    });

    it('sin sucursales el usuario queda inactivo', async () => {
      const created = await create({ username: 'sin.sucursal', branchIds: [] });
      expect(created.isActive).toBe(false);
    });

    it('rechaza un nombre de usuario repetido y uno vacío', async () => {
      await create({ username: 'repetido' });

      await expect(create({ username: 'REPETIDO ' })).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
      await expect(create({ username: '   ' })).rejects.toMatchObject({ code: 'USERNAME_REQUIRED' });
    });

    it('un PIN que ya usa otro usuario se rechaza y no se crea nada', async () => {
      await create({ username: 'pin.uno', pin: '246810' });

      await expect(create({ username: 'pin.dos', pin: '246810' })).rejects.toMatchObject({ code: 'PIN_ALREADY_IN_USE' });
      expect(await exists('pin.dos')).toBe(false);
    });

    it('una sucursal de otro tenant se rechaza y no se crea el usuario', async () => {
      await expect(create({ username: 'ajeno', branchIds: ['00000000-0000-4000-8000-000000000000'] })).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
      expect(await exists('ajeno')).toBe(false);
    });

    it('un rol inexistente en la tienda se rechaza sin crear el usuario', async () => {
      await expect(create({ username: 'sin.rol', roleId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });
      expect(await exists('sin.rol')).toBe(false);
    });
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
