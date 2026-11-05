import { DataSource } from 'typeorm';
import { CreateCustomerCommand } from '../../src/modules/customers/application/commands/create-customer/create-customer.command';
import { CreateCustomerHandler } from '../../src/modules/customers/application/commands/create-customer/create-customer.handler';
import { DeleteCustomerCommand } from '../../src/modules/customers/application/commands/delete-customer/delete-customer.command';
import { DeleteCustomerHandler } from '../../src/modules/customers/application/commands/delete-customer/delete-customer.handler';
import { UpdateCustomerCommand } from '../../src/modules/customers/application/commands/update-customer/update-customer.command';
import { UpdateCustomerHandler } from '../../src/modules/customers/application/commands/update-customer/update-customer.handler';
import { CONSUMER_FINAL_IDENTITY } from '../../src/modules/customers/domain/consumer-final';
import { Customer } from '../../src/modules/customers/domain/entities/customer.entity';
import { CashRegister } from '../../src/modules/sales/domain/entities/cash-register.entity';
import { CashSession } from '../../src/modules/sales/domain/entities/cash-session.entity';
import { PaymentMethod } from '../../src/modules/sales/domain/entities/sale-payment.entity';
import { Sale } from '../../src/modules/sales/domain/entities/sale.entity';
import { CashSessionStatus } from '../../src/modules/sales/domain/enums/cash-session-status.enum';
import { ProcessSaleCommand } from '../../src/modules/sales/application/commands/process-sale/process-sale.command';
import { ProcessSaleHandler } from '../../src/modules/sales/application/commands/process-sale/process-sale.handler';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

const NEW_KEY = (() => {
  let counter = 0;
  return () => `intento-${Date.now()}-${++counter}`;
})();

/** Comprador por defecto (CONSUMIDOR FINAL) e idempotencia de la venta con los handlers reales sobre Postgres. */
describe('Venta: comprador por defecto e idempotencia', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let variantId: string;
  let sessionId: string;
  let secondSessionId: string;

  const openSession = async (tenant: SeededTenant, code: number): Promise<string> => {
    const register = await db.getRepository(CashRegister).save(db.getRepository(CashRegister).create({ tenantId: tenant.tenantId, branchId: tenant.branchId, code, name: `Caja ${code}` }));
    const session = await db.getRepository(CashSession).save(
      db.getRepository(CashSession).create({ branchId: tenant.branchId, userId: tenant.ownerId, cashRegisterId: register.id, openingBalance: 0, status: CashSessionStatus.OPEN, openedAt: new Date() }),
    );
    return session.id;
  };

  const sell = (overrides: Partial<{ tenant: SeededTenant; session: string; customerId: string; quantity: number; clientRequestId: string; variant: string }> = {}) => {
    const tenant = overrides.tenant ?? shop;
    const quantity = overrides.quantity ?? 1;
    return new ProcessSaleHandler(db.manager, redisStub).execute(
      new ProcessSaleCommand(
        tenant.tenantId,
        tenant.ownerId,
        tenant.branchId,
        overrides.session ?? sessionId,
        overrides.customerId,
        [{ variantId: overrides.variant ?? variantId, quantity, price: 10 }],
        [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 10 * quantity }],
        undefined,
        undefined,
        undefined,
        overrides.clientRequestId,
      ),
    );
  };
  const consumerFinalOf = (tenantId: string) => db.getRepository(Customer).findOneByOrFail({ tenantId, identityNumber: CONSUMER_FINAL_IDENTITY });
  const salesWithKey = (key: string) => db.getRepository(Sale).find({ where: { tenantId: shop.tenantId, clientRequestId: key }, relations: { payments: true } });
  const stockOf = async (variant = variantId): Promise<number> => Number((await db.getRepository(ProductStock).findOneByOrFail({ branchId: shop.branchId, variantId: variant })).quantity);

  beforeAll(async () => {
    database = await startTestDatabase('idempotency');
    db = database.db;
    shop = await seedTenant(db, 'idempotencia');
    other = await seedTenant(db, 'idem-ajena');
    variantId = await seedVariant(db, shop.tenantId, 'IDEM-1');
    sessionId = await openSession(shop, 1);
    secondSessionId = await openSession(shop, 2);
    // seedTenant no crea el CONSUMIDOR FINAL (lo hace el onboarding): el primero se crea sobre la marcha
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('comprador por defecto', () => {
    it('una venta sin cliente se asigna al CONSUMIDOR FINAL de la tienda, que se crea si no existe', async () => {
      expect(await db.getRepository(Customer).countBy({ tenantId: shop.tenantId, identityNumber: CONSUMER_FINAL_IDENTITY })).toBe(0);
      const sale = await sell();
      const consumerFinal = await consumerFinalOf(shop.tenantId);
      expect(sale.customerId).toBe(consumerFinal.id);
      expect(consumerFinal).toMatchObject({ name: 'CONSUMIDOR FINAL', tenantId: shop.tenantId });
    });

    it('cada tienda usa el suyo y las ventas siguientes reutilizan el mismo', async () => {
      const first = await sell();
      const second = await sell();
      expect(second.customerId).toBe(first.customerId);
      expect(await db.getRepository(Customer).countBy({ tenantId: shop.tenantId, identityNumber: CONSUMER_FINAL_IDENTITY })).toBe(1);

      const foreignVariant = await seedVariant(db, other.tenantId, 'IDEM-AJENA');
      const foreignSession = await openSession(other, 1);
      const foreign = await sell({ tenant: other, variant: foreignVariant, session: foreignSession });
      expect(foreign.customerId).toBe((await consumerFinalOf(other.tenantId)).id);
      expect(foreign.customerId).not.toBe(first.customerId);
    });

    it('ventas simultáneas en una tienda que aún no lo tiene crean un solo CONSUMIDOR FINAL', async () => {
      const fresh = await seedTenant(db, 'sin-cf');
      const freshVariant = await seedVariant(db, fresh.tenantId, 'SIN-CF-1');
      const freshSession = await openSession(fresh, 1);
      const sales = await Promise.all([1, 2, 3].map(() => sell({ tenant: fresh, variant: freshVariant, session: freshSession })));
      expect(new Set(sales.map((s) => s.customerId)).size).toBe(1);
      expect(await db.getRepository(Customer).countBy({ tenantId: fresh.tenantId, identityNumber: CONSUMER_FINAL_IDENTITY })).toBe(1);
    });

    it('un cliente indicado se respeta; uno de otra tienda se rechaza', async () => {
      const mine = await new CreateCustomerHandler(db.getRepository(Customer)).execute(new CreateCustomerCommand(shop.tenantId, { identityNumber: '1700000001', name: 'Ana' }));
      expect((await sell({ customerId: mine.id })).customerId).toBe(mine.id);

      const foreign = await new CreateCustomerHandler(db.getRepository(Customer)).execute(new CreateCustomerCommand(other.tenantId, { identityNumber: '1700000002', name: 'Beto' }));
      await expect(sell({ customerId: foreign.id })).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    });

    it('el CONSUMIDOR FINAL no se puede eliminar ni cambiarle el documento, pero sí el nombre o el teléfono', async () => {
      const consumerFinal = await consumerFinalOf(shop.tenantId);
      const repo = db.getRepository(Customer);
      await expect(new DeleteCustomerHandler(repo).execute(new DeleteCustomerCommand(shop.tenantId, consumerFinal.id))).rejects.toMatchObject({ code: 'CONSUMER_FINAL_PROTECTED' });
      await expect(new UpdateCustomerHandler(repo).execute(new UpdateCustomerCommand(shop.tenantId, consumerFinal.id, { identityNumber: '123' }))).rejects.toMatchObject({ code: 'CONSUMER_FINAL_PROTECTED' });
      await expect(new UpdateCustomerHandler(repo).execute(new UpdateCustomerCommand(shop.tenantId, consumerFinal.id, { identityNumber: CONSUMER_FINAL_IDENTITY, phone: '0990000000' }))).resolves.toMatchObject({ phone: '0990000000' });
      expect(await repo.findOneBy({ id: consumerFinal.id })).not.toBeNull();
    });
  });

  describe('idempotencia con clientRequestId', () => {
    it('reintentar la misma venta devuelve la ya registrada: un solo cobro, un solo descuento de stock', async () => {
      const key = NEW_KEY();
      const before = await stockOf();
      const first = await sell({ clientRequestId: key, quantity: 2 });
      const retry = await sell({ clientRequestId: key, quantity: 2 });

      expect(retry.id).toBe(first.id);
      expect(retry.invoiceNumber).toBe(first.invoiceNumber);
      expect(retry.payments).toHaveLength(1);
      expect(retry.items).toHaveLength(1);
      expect(await stockOf()).toBe(before - 2);
      const stored = await salesWithKey(key);
      expect(stored).toHaveLength(1);
      expect(stored[0].payments).toHaveLength(1);
    });

    it('el reintento se reconoce aunque la sesión de caja ya se haya cerrado', async () => {
      const key = NEW_KEY();
      const first = await sell({ clientRequestId: key, session: secondSessionId });
      await db.getRepository(CashSession).update(secondSessionId, { status: CashSessionStatus.CLOSED });
      await expect(sell({ clientRequestId: key, session: secondSessionId })).resolves.toMatchObject({ id: first.id });
    });

    it('reintentos simultáneos con el mismo identificador crean una sola venta y todos reciben la misma', async () => {
      const key = NEW_KEY();
      const before = await stockOf();
      const results = await Promise.allSettled([sell({ clientRequestId: key }), sell({ clientRequestId: key }), sell({ clientRequestId: key }), sell({ clientRequestId: key })]);

      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const ids = results.map((r) => (r.status === 'fulfilled' ? r.value.id : ''));
      expect(new Set(ids).size).toBe(1);
      expect(await salesWithKey(key)).toHaveLength(1);
      expect(await stockOf()).toBe(before - 1);
    });

    it('el mismo identificador para una venta distinta se rechaza con IDEMPOTENCY_KEY_REUSED y no registra nada', async () => {
      const key = NEW_KEY();
      await sell({ clientRequestId: key, quantity: 1 });
      const before = await stockOf();

      await expect(sell({ clientRequestId: key, quantity: 3 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(await stockOf()).toBe(before);
      expect(await salesWithKey(key)).toHaveLength(1);
    });

    it('identificadores distintos son ventas distintas, y sin identificador nunca se deduplica', async () => {
      const a = await sell({ clientRequestId: NEW_KEY() });
      const b = await sell({ clientRequestId: NEW_KEY() });
      expect(a.id).not.toBe(b.id);

      const c = await sell();
      const d = await sell();
      expect(c.id).not.toBe(d.id);
      expect(c.clientRequestId ?? null).toBeNull();
    });

    it('el identificador es por tienda: otra tienda puede usar el mismo valor', async () => {
      const key = NEW_KEY();
      await sell({ clientRequestId: key });
      const foreignVariant = await seedVariant(db, other.tenantId, `IDEM-${key}`.slice(0, 20));
      const foreignSession = await openSession(other, 9);
      const foreign = await sell({ tenant: other, variant: foreignVariant, session: foreignSession, clientRequestId: key });
      expect(foreign.tenantId).toBe(other.tenantId);
    });
  });

  describe('migración de ventas antiguas sin comprador', () => {
    it('asigna el CONSUMIDOR FINAL de su tienda a las ventas con cliente null, creándolo si falta', async () => {
      const legacy = await sell();
      const oldConsumerFinal = await consumerFinalOf(shop.tenantId);
      // Estado antiguo: ventas sin cliente y el CONSUMIDOR FINAL borrado (antes se podía eliminar)
      await db.query(`UPDATE sales SET customer_id = NULL WHERE tenant_id = $1`, [shop.tenantId]);
      await db.query(`UPDATE customers SET deleted_at = now() WHERE id = $1`, [oldConsumerFinal.id]);
      expect((await db.query(`SELECT customer_id FROM sales WHERE id = $1`, [legacy.id]))[0].customer_id).toBeNull();

      await db.undoLastMigration(); // la del relleno es la última
      await db.runMigrations();

      const [row] = await db.query(`SELECT customer_id FROM sales WHERE id = $1`, [legacy.id]);
      const consumerFinal = await consumerFinalOf(shop.tenantId);
      expect(row.customer_id).toBe(consumerFinal.id);
      expect(consumerFinal.id).not.toBe(oldConsumerFinal.id);
      expect(await db.query(`SELECT 1 FROM sales WHERE tenant_id = $1 AND customer_id IS NULL`, [shop.tenantId])).toHaveLength(0);
    });
  });
});
