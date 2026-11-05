import { DataSource } from 'typeorm';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { RegisterExpenseCommand } from '../../src/modules/sales/application/commands/register-expense/register-expense.command';
import { RegisterExpenseHandler } from '../../src/modules/sales/application/commands/register-expense/register-expense.handler';
import { ProcessRefundCommand } from '../../src/modules/sales/application/commands/process-refund/process-refund.command';
import { ProcessRefundHandler } from '../../src/modules/sales/application/commands/process-refund/process-refund.handler';
import { ProcessSaleCommand } from '../../src/modules/sales/application/commands/process-sale/process-sale.command';
import { ProcessSaleHandler } from '../../src/modules/sales/application/commands/process-sale/process-sale.handler';
import { GetCashSessionDetailsHandler } from '../../src/modules/sales/application/queries/get-cash-session-details/get-cash-session-details.handler';
import { GetCashSessionDetailsQuery } from '../../src/modules/sales/application/queries/get-cash-session-details/get-cash-session-details.query';
import { GetExpensesHandler } from '../../src/modules/sales/application/queries/get-expenses/get-expenses.handler';
import { GetExpensesQuery } from '../../src/modules/sales/application/queries/get-expenses/get-expenses.query';
import { GetRefundsHandler } from '../../src/modules/sales/application/queries/get-refunds/get-refunds.handler';
import { GetRefundsQuery } from '../../src/modules/sales/application/queries/get-refunds/get-refunds.query';
import { GetSaleByInvoiceHandler } from '../../src/modules/sales/application/queries/get-sale-by-invoice/get-sale-by-invoice.handler';
import { GetSaleByInvoiceQuery } from '../../src/modules/sales/application/queries/get-sale-by-invoice/get-sale-by-invoice.query';
import { GetSalesByVariantHandler } from '../../src/modules/sales/application/queries/get-sales-by-variant/get-sales-by-variant.handler';
import { GetSalesByVariantQuery } from '../../src/modules/sales/application/queries/get-sales-by-variant/get-sales-by-variant.query';
import { GetSalesPaginatedHandler } from '../../src/modules/sales/application/queries/get-sales-paginated/get-sales-paginated.handler';
import { GetSalesPaginatedQuery } from '../../src/modules/sales/application/queries/get-sales-paginated/get-sales-paginated.query';
import { CashRegister } from '../../src/modules/sales/domain/entities/cash-register.entity';
import { CashSession } from '../../src/modules/sales/domain/entities/cash-session.entity';
import { Expense } from '../../src/modules/sales/domain/entities/expense.entity';
import { PaymentMethod } from '../../src/modules/sales/domain/entities/sale-payment.entity';
import { Refund } from '../../src/modules/sales/domain/entities/refund.entity';
import { Sale } from '../../src/modules/sales/domain/entities/sale.entity';
import { CashSessionStatus } from '../../src/modules/sales/domain/enums/cash-session-status.enum';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * Consultas de ventas, devoluciones, gastos y turnos con los handlers reales sobre Postgres.
 * Lo central: quien no es propietario solo ve lo de sus sucursales.
 */
describe('Consultas de ventas: aislamiento por tienda y por sucursal', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let northBranchId: string;
  let cashierId: string; // solo sucursal principal
  let variantId: string;

  let mainSessionId: string;
  let northSessionId: string;
  let mainSale: Sale;
  let northSale: Sale;

  const openSession = async (branchId: string, code: number, tenant: SeededTenant = shop): Promise<string> => {
    const register = await db.getRepository(CashRegister).save(db.getRepository(CashRegister).create({ tenantId: tenant.tenantId, branchId, code, name: `Caja ${code}` }));
    return (
      await db.getRepository(CashSession).save(
        db.getRepository(CashSession).create({ branchId, userId: tenant.ownerId, cashRegisterId: register.id, openingBalance: 100, status: CashSessionStatus.OPEN, openedAt: new Date() }),
      )
    ).id;
  };
  const sell = (branchId: string, session: string, quantity: number, tenant: SeededTenant = shop, variant = variantId) =>
    new ProcessSaleHandler(db.manager, redisStub).execute(
      new ProcessSaleCommand(tenant.tenantId, tenant.ownerId, branchId, session, undefined, [{ variantId: variant, quantity, price: 10 }], [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 10 * quantity }]),
    );

  const asOwner = { userId: '', isOwner: true };
  const asCashier = () => ({ userId: cashierId, isOwner: false });
  const owner = () => ({ ...asOwner, userId: shop.ownerId });

  const paginated = (who: { userId: string; isOwner: boolean }, extra: Partial<{ page: number; limit: number; branchId: string; start: string; end: string; tenantId: string }> = {}) =>
    new GetSalesPaginatedHandler(db.manager, redisStub).execute(
      new GetSalesPaginatedQuery(extra.tenantId ?? shop.tenantId, extra.start, extra.end, extra.page ?? 1, extra.limit ?? 10, extra.branchId, who.userId, who.isOwner),
    );
  const byVariant = (who: { userId: string; isOwner: boolean }, extra: Partial<{ branchId: string; page: number; limit: number; variant: string; tenantId: string }> = {}) =>
    new GetSalesByVariantHandler(db.manager, redisStub).execute(
      new GetSalesByVariantQuery(extra.tenantId ?? shop.tenantId, extra.variant ?? variantId, extra.page ?? 1, extra.limit ?? 10, extra.branchId, who.userId, who.isOwner),
    );
  const byInvoice = (who: { userId: string; isOwner: boolean }, invoiceNumber: string, tenantId = shop.tenantId) =>
    new GetSaleByInvoiceHandler(db.getRepository(Sale), db.getRepository(Refund), redisStub).execute(new GetSaleByInvoiceQuery(tenantId, invoiceNumber, who.userId, who.isOwner));
  const refunds = (who: { userId: string; isOwner: boolean }, cashSessionId?: string, saleId?: string, tenantId = shop.tenantId) =>
    new GetRefundsHandler(db.manager, redisStub).execute(new GetRefundsQuery(tenantId, cashSessionId, saleId, who.userId, who.isOwner));
  const expenses = (who: { userId: string; isOwner: boolean }, cashSessionId?: string, tenantId = shop.tenantId) =>
    new GetExpensesHandler(db.manager, redisStub).execute(new GetExpensesQuery(tenantId, cashSessionId, who.userId, who.isOwner));
  const sessionDetails = (who: { userId: string; isOwner: boolean }, sessionId: string, tenantId = shop.tenantId) =>
    new GetCashSessionDetailsHandler(db.getRepository(CashSession), db.getRepository(Sale), db.getRepository(Expense), db.getRepository(Refund), redisStub).execute(
      new GetCashSessionDetailsQuery(tenantId, sessionId, who.userId, who.isOwner),
    );

  beforeAll(async () => {
    database = await startTestDatabase('sales_queries');
    db = database.db;
    shop = await seedTenant(db, 'consultas');
    other = await seedTenant(db, 'consultas-aj');
    northBranchId = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    cashierId = (await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-q', password: 'x', isOwner: false }))).id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);
    variantId = await seedVariant(db, shop.tenantId, 'QRY-1');

    mainSessionId = await openSession(shop.branchId, 1);
    northSessionId = await openSession(northBranchId, 2);
    mainSale = await sell(shop.branchId, mainSessionId, 2);
    northSale = await sell(northBranchId, northSessionId, 3);

    await new ProcessRefundHandler(db.manager, redisStub).execute(new ProcessRefundCommand(shop.tenantId, shop.ownerId, shop.branchId, mainSale.id, mainSessionId, 'cambio', [{ variantId, quantity: 1 }]));
    await new ProcessRefundHandler(db.manager, redisStub).execute(new ProcessRefundCommand(shop.tenantId, shop.ownerId, northBranchId, northSale.id, northSessionId, 'defecto', [{ variantId, quantity: 1 }]));
    const expense = (branchId: string, session: string, description: string) =>
      new RegisterExpenseHandler(db.manager).execute(new RegisterExpenseCommand(shop.tenantId, branchId, description, 5, 'OTROS', shop.ownerId, session));
    await expense(shop.branchId, mainSessionId, 'Bolsas principal');
    await expense(northBranchId, northSessionId, 'Bolsas norte');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('listado paginado de ventas', () => {
    it('el propietario ve todas las sucursales, las más recientes primero, con comprador y sucursal', async () => {
      const { data, meta } = await paginated(owner());
      expect(meta).toMatchObject({ total: 2, page: 1, limit: 10, totalPages: 1 });
      expect(data.map((s) => s.id)).toEqual([northSale.id, mainSale.id]);
      expect(data[0]).toMatchObject({ invoiceNumber: northSale.invoiceNumber, status: 'PARTIALLY_REFUNDED', customer: { name: 'CONSUMIDOR FINAL' }, branch: { name: 'Norte' } });
    });

    it('pagina y filtra por sucursal y por rango de fechas', async () => {
      expect((await paginated(owner(), { page: 2, limit: 1 })).data.map((s) => s.id)).toEqual([mainSale.id]);
      expect((await paginated(owner(), { branchId: shop.branchId })).data.map((s) => s.id)).toEqual([mainSale.id]);

      await db.query(`UPDATE sales SET created_at = '2020-01-10T12:00:00Z' WHERE id = $1`, [mainSale.id]);
      expect((await paginated(owner(), { start: '2020-01-10', end: '2020-01-10' })).data.map((s) => s.id)).toEqual([mainSale.id]);
      expect((await paginated(owner())).data.map((s) => s.id)).toEqual([northSale.id]);
      await db.query(`UPDATE sales SET created_at = now() WHERE id = $1`, [mainSale.id]);
    });

    it('quien no es propietario debe indicar una sucursal suya', async () => {
      await expect(paginated(asCashier())).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(paginated(asCashier(), { branchId: northBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      expect((await paginated(asCashier(), { branchId: shop.branchId })).data.map((s) => s.id)).toEqual([mainSale.id]);
    });

    it('nunca trae ventas de otra tienda', async () => {
      expect((await paginated({ userId: other.ownerId, isOwner: true }, { tenantId: other.tenantId })).meta.total).toBe(0);
    });
  });

  describe('ventas de una variante', () => {
    it('lista las ventas que la incluyen y respeta la sucursal del usuario', async () => {
      expect((await byVariant(owner())).meta.total).toBe(2);
      await expect(byVariant(asCashier())).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(byVariant(asCashier(), { branchId: northBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      expect((await byVariant(asCashier(), { branchId: shop.branchId })).data.map((s) => s.id)).toEqual([mainSale.id]);
    });

    it('una variante de otra tienda no devuelve nada', async () => {
      const foreignVariant = await seedVariant(db, other.tenantId, 'QRY-AJENA');
      expect((await byVariant(owner(), { variant: foreignVariant })).data).toEqual([]);
    });
  });

  describe('venta por folio', () => {
    it('devuelve la venta con pagos, ítems, cantidades ya devueltas y devoluciones', async () => {
      const sale = await byInvoice(owner(), mainSale.invoiceNumber ?? '');
      expect(sale).toMatchObject({ id: mainSale.id, total: 20, status: 'PARTIALLY_REFUNDED', isFullyRefunded: false, payments: [{ paymentMethod: 'EFECTIVO', amount: 20 }] });
      expect(sale.items[0]).toMatchObject({ quantity: 2, refundedQty: 1, refundableQty: 1, sku: 'QRY-1' });
      expect(sale.refunds).toHaveLength(1);
      expect(sale.refunds[0]).toMatchObject({ reason: 'cambio', totalRefunded: 10 });
    });

    it('un folio inexistente o de otra tienda responde SALE_NOT_FOUND', async () => {
      await expect(byInvoice(owner(), 'no-existe')).rejects.toMatchObject({ code: 'SALE_NOT_FOUND' });
      await expect(byInvoice({ userId: other.ownerId, isOwner: true }, mainSale.invoiceNumber ?? '', other.tenantId)).rejects.toMatchObject({ code: 'SALE_NOT_FOUND' });
    });

    it('quien no es propietario solo consulta ventas de sus sucursales', async () => {
      await expect(byInvoice(asCashier(), mainSale.invoiceNumber ?? '')).resolves.toMatchObject({ id: mainSale.id });
      await expect(byInvoice(asCashier(), northSale.invoiceNumber ?? '')).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    });
  });

  describe('devoluciones y gastos', () => {
    it('las devoluciones se filtran por turno o venta, con sus ítems', async () => {
      const all = await refunds(owner());
      expect(all).toHaveLength(2);
      expect(all[0].items[0].variant.product.name).toBe('QRY-1');
      expect((await refunds(owner(), mainSessionId)).map((r) => r.saleId)).toEqual([mainSale.id]);
      expect((await refunds(owner(), undefined, northSale.id)).map((r) => r.saleId)).toEqual([northSale.id]);
    });

    it('quien no es propietario solo ve las devoluciones de sus sucursales, sin pedirlas por turno ajeno', async () => {
      expect((await refunds(asCashier())).map((r) => r.saleId)).toEqual([mainSale.id]);
      expect(await refunds(asCashier(), northSessionId)).toEqual([]);
      expect(await refunds(asCashier(), undefined, northSale.id)).toEqual([]);
    });

    it('los gastos exigen el turno y quien no es propietario solo ve los de sus sucursales', async () => {
      expect(await expenses(owner())).toEqual([]);
      expect((await expenses(owner(), mainSessionId)).map((e) => e.description)).toEqual(['Bolsas principal']);
      expect((await expenses(asCashier(), mainSessionId)).map((e) => e.description)).toEqual(['Bolsas principal']);
      expect(await expenses(asCashier(), northSessionId)).toEqual([]);
    });

    it('nunca mezclan datos de otra tienda', async () => {
      const foreign = { userId: other.ownerId, isOwner: true };
      expect(await refunds(foreign, undefined, undefined, other.tenantId)).toEqual([]);
      expect(await expenses(foreign, mainSessionId, other.tenantId)).toEqual([]);
    });
  });

  describe('detalle de un turno', () => {
    it('el propietario ve cualquier turno de su tienda', async () => {
      const details = await sessionDetails(owner(), northSessionId);
      expect(details.kpis).toMatchObject({ grossSales: 30, totalRefunds: 10, totalExpenses: 5 });
    });

    it('quien no es propietario solo ve turnos de sus sucursales', async () => {
      await expect(sessionDetails(asCashier(), mainSessionId)).resolves.toMatchObject({ kpis: { grossSales: 20 } });
      await expect(sessionDetails(asCashier(), northSessionId)).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    });

    it('un turno de otra tienda no existe para quien consulta', async () => {
      await expect(sessionDetails({ userId: other.ownerId, isOwner: true }, mainSessionId, other.tenantId)).rejects.toMatchObject({ code: 'CASH_SESSION_NOT_FOUND' });
    });
  });
});
