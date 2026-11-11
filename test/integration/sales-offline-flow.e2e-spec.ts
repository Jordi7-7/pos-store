import { DataSource } from 'typeorm';
import { ProcessSaleCommand } from '../../src/modules/sales/application/commands/process-sale/process-sale.command';
import { ProcessSaleHandler } from '../../src/modules/sales/application/commands/process-sale/process-sale.handler';
import { GetSaleByInvoiceHandler } from '../../src/modules/sales/application/queries/get-sale-by-invoice/get-sale-by-invoice.handler';
import { GetSaleByInvoiceQuery } from '../../src/modules/sales/application/queries/get-sale-by-invoice/get-sale-by-invoice.query';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { Refund } from '../../src/modules/sales/domain/entities/refund.entity';
import { CashRegister } from '../../src/modules/sales/domain/entities/cash-register.entity';
import { CashSession } from '../../src/modules/sales/domain/entities/cash-session.entity';
import { PaymentMethod } from '../../src/modules/sales/domain/entities/sale-payment.entity';
import { Sale } from '../../src/modules/sales/domain/entities/sale.entity';
import { CashSessionStatus } from '../../src/modules/sales/domain/enums/cash-session-status.enum';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

const HOUR = 3_600_000;
const NEW_KEY = (() => {
  let counter = 0;
  return () => `offline-${Date.now()}-${++counter}`;
})();

/** Venta hecha sin conexión y sincronizada después: hora real, número provisional y reglas acordadas, con handlers reales sobre Postgres. */
describe('Venta hecha sin conexión', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let variantId: string;
  let sessionId: string;
  let sessionOpenedAt: Date;

  const openSession = async (tenant: SeededTenant, code: number, openedAt: Date): Promise<string> => {
    const register = await db.getRepository(CashRegister).save(db.getRepository(CashRegister).create({ tenantId: tenant.tenantId, branchId: tenant.branchId, code, name: `Caja ${code}` }));
    const session = await db.getRepository(CashSession).save(
      db.getRepository(CashSession).create({ branchId: tenant.branchId, userId: tenant.ownerId, cashRegisterId: register.id, openingBalance: 0, status: CashSessionStatus.OPEN, openedAt }),
    );
    return session.id;
  };

  const sell = (overrides: Partial<{ session: string; quantity: number; clientRequestId: string; occurredAt: Date; offlineReference: string }> = {}) => {
    const quantity = overrides.quantity ?? 1;
    return new ProcessSaleHandler(db.manager, redisStub).execute(
      new ProcessSaleCommand(
        shop.tenantId,
        shop.ownerId,
        shop.branchId,
        overrides.session ?? sessionId,
        undefined,
        [{ variantId, quantity, price: 10 }],
        [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 10 * quantity }],
        undefined,
        undefined,
        undefined,
        overrides.clientRequestId ?? NEW_KEY(),
        overrides.occurredAt,
        overrides.offlineReference,
      ),
    );
  };
  const findByFolio = (tenantId: string, folio: string) =>
    new GetSaleByInvoiceHandler(db.getRepository(Sale), db.getRepository(Refund), redisStub).execute(new GetSaleByInvoiceQuery(tenantId, folio, shop.ownerId, true));
  const stockOf = async (): Promise<number> => Number((await db.getRepository(ProductStock).findOneByOrFail({ branchId: shop.branchId, variantId })).quantity);

  beforeAll(async () => {
    database = await startTestDatabase('offline-sales');
    db = database.db;
    shop = await seedTenant(db, 'offline');
    other = await seedTenant(db, 'offline-ajena');
    variantId = await seedVariant(db, shop.tenantId, 'OFF-1');
    sessionOpenedAt = new Date(Date.now() - 3 * HOUR);
    sessionId = await openSession(shop, 1, sessionOpenedAt);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('hora real de la venta', () => {
    it('una venta hecha durante el turno conserva su hora, también en el kardex', async () => {
      const occurredAt = new Date(Date.now() - HOUR);

      const sale = await sell({ occurredAt });

      expect((await db.getRepository(Sale).findOneByOrFail({ id: sale.id })).createdAt.getTime()).toBe(occurredAt.getTime());
      const movements = await db.getRepository(InventoryMovement).find({ where: { tenantId: shop.tenantId, variantId, createdAt: occurredAt } });
      expect(movements).toHaveLength(1);
    });

    it('un reloj adelantado se acota a ahora y uno atrasado, a la apertura del turno', async () => {
      const before = Date.now();
      const future = await sell({ occurredAt: new Date(Date.now() + 24 * HOUR) });
      const past = await sell({ occurredAt: new Date(sessionOpenedAt.getTime() - 24 * HOUR) });

      const futureTime = (await db.getRepository(Sale).findOneByOrFail({ id: future.id })).createdAt.getTime();
      expect(futureTime).toBeGreaterThanOrEqual(before);
      expect(futureTime).toBeLessThanOrEqual(Date.now());
      expect((await db.getRepository(Sale).findOneByOrFail({ id: past.id })).createdAt.getTime()).toBe(sessionOpenedAt.getTime());
    });

    it('sin hora indicada rige la hora de registro', async () => {
      const before = Date.now();
      const sale = await sell();

      expect((await db.getRepository(Sale).findOneByOrFail({ id: sale.id })).createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });
  });

  describe('número provisional', () => {
    it('se guarda en MAYÚSCULAS y la venta se encuentra con él (escrito como sea) o con el folio definitivo', async () => {
      const sale = await sell({ offlineReference: 'off-a3f9-0007' });

      const byAlias = await findByFolio(shop.tenantId, ' off-a3f9-0007 ');
      const byFolio = await findByFolio(shop.tenantId, sale.invoiceNumber as string);

      expect(byAlias.id).toBe(sale.id);
      expect(byFolio.id).toBe(sale.id);
      expect(byAlias).toMatchObject({ invoiceNumber: sale.invoiceNumber, offlineReference: 'OFF-A3F9-0007' });
    });

    it('otra tienda no encuentra la venta con ese número', async () => {
      await sell({ offlineReference: 'OFF-PRIV-0001' });

      await expect(findByFolio(other.tenantId, 'OFF-PRIV-0001')).rejects.toMatchObject({ code: 'SALE_NOT_FOUND' });
    });

    it('un número provisional ya usado por otra venta se rechaza con OFFLINE_REFERENCE_TAKEN y no toca el stock', async () => {
      await sell({ offlineReference: 'OFF-DUP-0001' });
      const stock = await stockOf();

      await expect(sell({ offlineReference: 'OFF-DUP-0001' })).rejects.toMatchObject({ code: 'OFFLINE_REFERENCE_TAKEN' });

      expect(await stockOf()).toBe(stock);
    });

    it('reenviar la misma venta (misma clave y mismo provisional) devuelve la ya registrada, sin error ni doble descuento', async () => {
      const key = NEW_KEY();
      const first = await sell({ clientRequestId: key, offlineReference: 'OFF-RETRY-01' });
      const stock = await stockOf();

      const retry = await sell({ clientRequestId: key, offlineReference: 'OFF-RETRY-01' });

      expect(retry.id).toBe(first.id);
      expect(await stockOf()).toBe(stock);
    });

    it('una venta ya registrada en línea (la respuesta se perdió) que se sincroniza después recibe su número provisional', async () => {
      const key = NEW_KEY();
      const original = await sell({ clientRequestId: key });
      expect(original.offlineReference).toBeNull();

      const replay = await sell({ clientRequestId: key, offlineReference: 'off-lost-0001' });

      expect(replay.id).toBe(original.id);
      expect((await findByFolio(shop.tenantId, 'OFF-LOST-0001')).id).toBe(original.id);
    });

    it('dos envíos simultáneos de la misma venta registran una sola', async () => {
      const key = NEW_KEY();

      const [a, b] = await Promise.all([sell({ clientRequestId: key, offlineReference: 'OFF-RACE-001' }), sell({ clientRequestId: key, offlineReference: 'OFF-RACE-001' })]);

      expect(a.id).toBe(b.id);
      expect(await db.getRepository(Sale).count({ where: { tenantId: shop.tenantId, clientRequestId: key } })).toBe(1);
    });
  });

  describe('reglas acordadas al sincronizar', () => {
    it('una venta sin stock suficiente se acepta y deja el stock en negativo (la venta ya se entregó)', async () => {
      const stock = await stockOf();

      await sell({ quantity: stock + 500, offlineReference: 'OFF-NOSTOCK-1' });

      expect(await stockOf()).toBe(-500);
    });

    it('con el turno ya cerrado se rechaza con NO_OPEN_CASH_SESSION (queda para revisión en el aparato)', async () => {
      const closedSession = await openSession(shop, 2, new Date(Date.now() - 2 * HOUR));
      await db.getRepository(CashSession).update(closedSession, { status: CashSessionStatus.CLOSED });

      await expect(sell({ session: closedSession, offlineReference: 'OFF-CLOSED-01' })).rejects.toMatchObject({ code: 'NO_OPEN_CASH_SESSION' });
    });
  });
});
