import { DataSource } from 'typeorm';
import { AdjustStockCommand } from '../../src/modules/products/application/commands/adjust-stock/adjust-stock.command';
import { AdjustStockHandler } from '../../src/modules/products/application/commands/adjust-stock/adjust-stock.handler';
import { BatchStatus, Batch } from '../../src/modules/batches/domain/entities/batch.entity';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../src/modules/products/domain/entities/product-batch.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { CancelPurchaseOrderCommand } from '../../src/modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.command';
import { CancelPurchaseOrderHandler } from '../../src/modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.handler';
import { ImportPurchasesCommand } from '../../src/modules/purchases/application/commands/import-purchases/import-purchases.command';
import { ImportPurchasesHandler } from '../../src/modules/purchases/application/commands/import-purchases/import-purchases.handler';
import { RegisterPurchaseCommand, RegisterPurchaseItemInput } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.command';
import { RegisterPurchaseHandler } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.handler';
import { PurchaseOrder } from '../../src/modules/purchases/domain/entities/purchase-order.entity';
import { PurchaseOrderStatus } from '../../src/modules/purchases/domain/enums/purchase-order-status.enum';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * Compras con los handlers reales sobre Postgres: registrar, importar y cancelar, con sus
 * efectos en stock, lotes, kardex y costo promedio.
 */
describe('Compras: registrar, importar y cancelar', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const register = (items: RegisterPurchaseItemInput[], overrides: Partial<{ userId: string; supplierId: string; branchId: string; tenantId: string; invoice: string }> = {}) =>
    new RegisterPurchaseHandler(db.manager, redisStub).execute(
      new RegisterPurchaseCommand(
        overrides.tenantId ?? shop.tenantId,
        overrides.userId ?? shop.ownerId,
        overrides.supplierId ?? shop.supplierId,
        overrides.branchId ?? shop.branchId,
        overrides.invoice ?? 'F-001',
        items,
      ),
    );

  const cancel = (purchaseOrderId: string, tenantId = shop.tenantId) =>
    new CancelPurchaseOrderHandler(db.manager, redisStub).execute(new CancelPurchaseOrderCommand(tenantId, shop.ownerId, purchaseOrderId));

  const importPurchase = (items: Array<{ sku: string; quantity: number }>, invoice?: string) =>
    new ImportPurchasesHandler(db.manager, redisStub).execute(
      new ImportPurchasesCommand(shop.tenantId, shop.ownerId, shop.branchId, items, invoice),
    );

  const stockOf = async (variantId: string): Promise<number> => {
    const stock = await db.getRepository(ProductStock).findOneBy({ branchId: shop.branchId, variantId });
    return stock ? Number(stock.quantity) : 0;
  };
  const costOf = async (variantId: string): Promise<number> => Number((await db.getRepository(ProductVariant).findOneByOrFail({ id: variantId })).purchasePrice);
  const movementsOf = (variantId: string) => db.getRepository(InventoryMovement).find({ where: { variantId }, order: { createdAt: 'ASC' } });
  const countOrders = (): Promise<number> => db.getRepository(PurchaseOrder).countBy({ tenantId: shop.tenantId });

  const adjust = (variantId: string, quantity: number, type: 'IN' | 'OUT') =>
    new AdjustStockHandler(db.manager, redisStub).execute(new AdjustStockCommand(shop.tenantId, shop.ownerId, shop.branchId, variantId, quantity, type));

  beforeAll(async () => {
    database = await startTestDatabase('purchases');
    db = database.db;
    shop = await seedTenant(db, 'compras');
    other = await seedTenant(db, 'ajena');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('registrar una compra', () => {
    it('suma el total exacto, ingresa el stock y deja lote, kardex e ítems cuadrados', async () => {
      const variantA = await seedVariant(db, shop.tenantId, 'REG-A');
      const variantB = await seedVariant(db, shop.tenantId, 'REG-B');

      // 3 × 0.10 + 3 × 0.20 = 0.90 (con coma flotante daría 0.9000000000000001)
      const order = await register([
        { variantId: variantA, quantity: 3, purchasePrice: 0.1 },
        { variantId: variantB, quantity: 3, purchasePrice: 0.2 },
      ]);

      expect(Number(order.totalAmount)).toBe(0.9);
      expect(order.status).toBe(PurchaseOrderStatus.COMPLETED);
      expect(await stockOf(variantA)).toBe(3);
      expect(await stockOf(variantB)).toBe(3);

      const batches = await db.getRepository(ProductBatch).find({ where: { variantId: variantA } });
      expect(batches).toHaveLength(1);
      expect(Number(batches[0].initialQuantity)).toBe(3);
      expect(Number(batches[0].remainingQuantity)).toBe(3);
      expect(Number(batches[0].unitCost)).toBe(0.1);

      const movements = await movementsOf(variantA);
      expect(movements).toMatchObject([{ type: 'IN', reason: 'COMPRA', purchaseOrderId: order.id }]);
      expect(Number(movements[0].quantity)).toBe(3);
    });

    it('el costo promedio ponderado sigue las entradas: la primera fija el costo y la segunda lo promedia', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'PMP-1', { purchasePrice: 4 });

      await register([{ variantId, quantity: 10, purchasePrice: 6 }]);
      expect(await costOf(variantId)).toBe(6);

      await register([{ variantId, quantity: 10, purchasePrice: 8 }]);
      expect(await costOf(variantId)).toBe(7);
      expect(await stockOf(variantId)).toBe(20);
    });

    it('la misma variante en dos líneas de una compra acumula stock y costo sin perder nada', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'DUP-1', { purchasePrice: 4 });

      const order = await register([
        { variantId, quantity: 10, purchasePrice: 6 },
        { variantId, quantity: 10, purchasePrice: 8 },
      ]);

      expect(Number(order.totalAmount)).toBe(140);
      expect(await stockOf(variantId)).toBe(20);
      expect(await costOf(variantId)).toBe(7);
    });

    it('compras simultáneas de una variante sin stock no chocan ni pierden unidades', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'CONC-1');

      await Promise.all([1, 2, 3, 4, 5].map((n) => register([{ variantId, quantity: 2, purchasePrice: 5 }], { invoice: `F-C${n}` })));

      expect(await stockOf(variantId)).toBe(10);
      expect(await db.getRepository(Batch).countBy({ tenantId: shop.tenantId, code: 'F-C1' })).toBe(1);
    });

    it('compras simultáneas con las mismas variantes en orden cruzado no se bloquean entre sí', async () => {
      const first = await seedVariant(db, shop.tenantId, 'CRUZ-A');
      const second = await seedVariant(db, shop.tenantId, 'CRUZ-B');
      const forward = [{ variantId: first, quantity: 1, purchasePrice: 5 }, { variantId: second, quantity: 1, purchasePrice: 5 }];
      const backward = [...forward].reverse();

      await Promise.all(Array.from({ length: 10 }, (_, i) => register(i % 2 === 0 ? forward : backward, { invoice: `F-X${i}` })));

      expect(await stockOf(first)).toBe(10);
      expect(await stockOf(second)).toBe(10);
    });

    it('si una línea falla no queda nada a medias (ni orden, ni stock, ni lote)', async () => {
      const good = await seedVariant(db, shop.tenantId, 'ATOM-1');
      const before = await countOrders();

      await expect(
        register([
          { variantId: good, quantity: 5, purchasePrice: 3 },
          { variantId: '00000000-0000-4000-8000-000000000000', quantity: 1, purchasePrice: 3 },
        ]),
      ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });

      expect(await countOrders()).toBe(before);
      expect(await stockOf(good)).toBe(0);
      expect(await db.getRepository(ProductBatch).countBy({ variantId: good })).toBe(0);
    });

    it('no acepta variantes de otra tienda', async () => {
      const foreign = await seedVariant(db, other.tenantId, 'AJENA-1');

      await expect(register([{ variantId: foreign, quantity: 1, purchasePrice: 1 }])).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });

    it('rechaza un proveedor o una sucursal que no son de la tienda', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'REF-1');
      const items = [{ variantId, quantity: 1, purchasePrice: 1 }];

      await expect(register(items, { supplierId: other.supplierId })).rejects.toMatchObject({ code: 'SUPPLIER_NOT_FOUND' });
      await expect(register(items, { branchId: other.branchId })).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
    });

    it('un usuario que no es propietario solo compra en sus sucursales asignadas', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'ACC-1');
      const clerk = await db.getRepository(User).save(
        db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Bodeguero', username: 'bodeguero', password: 'x', isOwner: false }),
      );

      await expect(register([{ variantId, quantity: 1, purchasePrice: 1 }], { userId: clerk.id })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });

      await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [clerk.id, shop.branchId]);
      await expect(register([{ variantId, quantity: 1, purchasePrice: 1 }], { userId: clerk.id })).resolves.toBeDefined();
    });

    it('una compra sin líneas se rechaza en lugar de crear una orden vacía', async () => {
      const before = await countOrders();

      await expect(register([])).rejects.toMatchObject({ code: 'EMPTY_PURCHASE' });
      expect(await countOrders()).toBe(before);
    });
  });

  describe('cancelar una compra', () => {
    it('devuelve el stock, vacía los lotes, anula el lote y deja el movimiento compensatorio', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'CAN-1');
      const order = await register([{ variantId, quantity: 8, purchasePrice: 5 }]);

      await cancel(order.id);

      expect(await stockOf(variantId)).toBe(0);
      const batch = await db.getRepository(ProductBatch).findOneByOrFail({ variantId });
      expect(Number(batch.remainingQuantity)).toBe(0);
      expect((await db.getRepository(Batch).findOneByOrFail({ purchaseOrderId: order.id })).status).toBe(BatchStatus.CANCELLED);
      expect((await db.getRepository(PurchaseOrder).findOneByOrFail({ id: order.id })).status).toBe(PurchaseOrderStatus.CANCELLED);
      expect((await movementsOf(variantId)).map((movement) => `${movement.type}:${movement.reason}`)).toEqual(['IN:COMPRA', 'OUT:ANULACION_COMPRA']);
    });

    it('no se puede cancelar si ya se vendieron unidades de sus lotes, y no cambia nada', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'CAN-2');
      const order = await register([{ variantId, quantity: 10, purchasePrice: 5 }]);
      await adjust(variantId, 3, 'OUT');

      await expect(cancel(order.id)).rejects.toMatchObject({ code: 'PURCHASE_BATCH_ALREADY_SOLD', details: { consumed: 3 } });

      expect(await stockOf(variantId)).toBe(7);
      expect((await db.getRepository(PurchaseOrder).findOneByOrFail({ id: order.id })).status).toBe(PurchaseOrderStatus.COMPLETED);
    });

    it('cancelar dos veces responde ORDER_ALREADY_CANCELLED', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'CAN-3');
      const order = await register([{ variantId, quantity: 4, purchasePrice: 5 }]);
      await cancel(order.id);

      await expect(cancel(order.id)).rejects.toMatchObject({ code: 'PURCHASE_ORDER_ALREADY_CANCELLED' });
    });

    it('dos cancelaciones simultáneas revierten el stock una sola vez', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'CAN-4');
      await adjust(variantId, 6, 'IN');
      const order = await register([{ variantId, quantity: 4, purchasePrice: 5 }]);

      const results = await Promise.allSettled([cancel(order.id), cancel(order.id)]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(await stockOf(variantId)).toBe(6);
    });

    it('una venta simultánea a la cancelación nunca deja el stock distinto de lo que queda en los lotes', async () => {
      const remainingInBatches = async (variantId: string): Promise<number> =>
        (await db.getRepository(ProductBatch).find({ where: { variantId } })).reduce((sum, batch) => sum + Number(batch.remainingQuantity), 0);

      for (let attempt = 0; attempt < 12; attempt++) {
        const variantId = await seedVariant(db, shop.tenantId, `RACE-${attempt}`);
        await adjust(variantId, 20, 'IN'); // otro lote, para que el chequeo de stock no oculte el problema
        const order = await register([{ variantId, quantity: 10, purchasePrice: 5 }], { invoice: `F-R${attempt}` });

        await Promise.allSettled([cancel(order.id), adjust(variantId, 3, 'OUT')]);

        expect(await stockOf(variantId)).toBe(await remainingInBatches(variantId));
      }
    });

    it('una orden de otra tienda no se puede cancelar', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'CAN-5');
      const order = await register([{ variantId, quantity: 1, purchasePrice: 5 }]);

      await expect(cancel(order.id, other.tenantId)).rejects.toMatchObject({ code: 'PURCHASE_ORDER_NOT_FOUND' });
      expect(await stockOf(variantId)).toBe(1);
    });
  });

  describe('importar compras por SKU', () => {
    it('ingresa el stock al costo actual de cada variante y crea una sola orden', async () => {
      const first = await seedVariant(db, shop.tenantId, 'IMP-A', { purchasePrice: 2.5 });
      const second = await seedVariant(db, shop.tenantId, 'IMP-B', { purchasePrice: 4 });

      const order = await importPurchase([{ sku: 'IMP-A', quantity: 4 }, { sku: 'IMP-B', quantity: 2 }], 'LOTE-9');

      expect(Number(order.totalAmount)).toBe(18); // 4 × 2.50 + 2 × 4.00
      expect(order.invoiceNumber).toBe('LOTE-9');
      expect(await stockOf(first)).toBe(4);
      expect(await stockOf(second)).toBe(2);
      expect((await movementsOf(first)).map((movement) => movement.reason)).toEqual(['COMPRA']);
    });

    it('sin número de factura usa IMP-MASIVO', async () => {
      await seedVariant(db, shop.tenantId, 'IMP-C');
      const order = await importPurchase([{ sku: 'IMP-C', quantity: 1 }]);
      expect(order.invoiceNumber).toBe('IMP-MASIVO');
    });

    it('SKUs inexistentes se rechazan indicando cuáles, sin importar nada', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'IMP-D');
      const before = await countOrders();

      await expect(importPurchase([{ sku: 'IMP-D', quantity: 1 }, { sku: 'NO-EXISTE', quantity: 1 }])).rejects.toMatchObject({
        code: 'SKUS_NOT_FOUND',
        details: { skus: ['NO-EXISTE'] },
      });

      expect(await countOrders()).toBe(before);
      expect(await stockOf(variantId)).toBe(0);
    });

    it('una cantidad cero o negativa se rechaza sin importar nada', async () => {
      const variantId = await seedVariant(db, shop.tenantId, 'IMP-E');

      await expect(importPurchase([{ sku: 'IMP-E', quantity: 5 }, { sku: 'IMP-E', quantity: 0 }])).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
      expect(await stockOf(variantId)).toBe(0);
    });

    it('rechaza una importación vacía o de más de 3000 filas', async () => {
      await expect(importPurchase([])).rejects.toMatchObject({ code: 'IMPORT_EMPTY' });
      const tooMany = Array.from({ length: 3001 }, () => ({ sku: 'IMP-A', quantity: 1 }));
      await expect(importPurchase(tooMany)).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED', details: { received: 3001, max: 3000 } });
    });

    it('no importa SKUs de otra tienda', async () => {
      await seedVariant(db, other.tenantId, 'SOLO-AJENA');
      await expect(importPurchase([{ sku: 'SOLO-AJENA', quantity: 1 }])).rejects.toMatchObject({ code: 'SKUS_NOT_FOUND' });
    });
  });
});
