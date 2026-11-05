import { DataSource } from 'typeorm';
import { InventoryMovementType } from '../../src/common/enums/inventory-movement-type.enum';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { AdjustStockCommand } from '../../src/modules/products/application/commands/adjust-stock/adjust-stock.command';
import { AdjustStockHandler } from '../../src/modules/products/application/commands/adjust-stock/adjust-stock.handler';
import { GetInventoryMovementsByVariantHandler } from '../../src/modules/products/application/queries/get-inventory-movements-by-variant/get-inventory-movements-by-variant.handler';
import { GetInventoryMovementsByVariantQuery } from '../../src/modules/products/application/queries/get-inventory-movements-by-variant/get-inventory-movements-by-variant.query';
import { CancelPurchaseOrderCommand } from '../../src/modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.command';
import { CancelPurchaseOrderHandler } from '../../src/modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.handler';
import { RegisterPurchaseCommand } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.command';
import { RegisterPurchaseHandler } from '../../src/modules/purchases/application/commands/register-purchase/register-purchase.handler';
import { GetPurchasesHandler } from '../../src/modules/purchases/application/queries/get-purchases/get-purchases.handler';
import { GetPurchasesQuery } from '../../src/modules/purchases/application/queries/get-purchases/get-purchases.query';
import { GetPurchasesByVariantHandler } from '../../src/modules/purchases/application/queries/get-purchases-by-variant/get-purchases-by-variant.handler';
import { GetPurchasesByVariantQuery } from '../../src/modules/purchases/application/queries/get-purchases-by-variant/get-purchases-by-variant.query';
import { ValidateImportPurchasesHandler } from '../../src/modules/purchases/application/queries/validate-import-purchases/validate-import-purchases.handler';
import { ValidateImportPurchasesQuery } from '../../src/modules/purchases/application/queries/validate-import-purchases/validate-import-purchases.query';
import { Supplier } from '../../src/modules/purchases/domain/entities/supplier.entity';
import { ListRolesHandler } from '../../src/modules/roles/application/queries/list-roles/list-roles.handler';
import { ListRolesQuery } from '../../src/modules/roles/application/queries/list-roles/list-roles.query';
import { Role } from '../../src/modules/roles/domain/entities/role.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Consultas de compras, kardex, validación de importación y roles con los handlers reales sobre Postgres. */
describe('Consultas de compras, kardex y roles', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let northBranchId: string;
  let cashierId: string; // solo sucursal principal
  let secondSupplierId: string;
  let variantId: string;
  let otherVariantId: string;

  const owner = () => ({ userId: shop.ownerId, isOwner: true });
  const cashier = () => ({ userId: cashierId, isOwner: false });
  type Who = { userId: string; isOwner: boolean };

  const buy = (branchId: string, items: Array<{ variantId: string; quantity: number; purchasePrice: number }>, invoice: string, supplierId = shop.supplierId) =>
    new RegisterPurchaseHandler(db.manager, redisStub).execute(new RegisterPurchaseCommand(shop.tenantId, shop.ownerId, supplierId, branchId, invoice, items));
  const purchases = (who: Who, extra: Partial<{ branchId: string; supplierId: string; start: string; end: string; page: number; limit: number; tenantId: string }> = {}) =>
    new GetPurchasesHandler(db.manager, redisStub).execute(
      new GetPurchasesQuery(extra.tenantId ?? shop.tenantId, extra.branchId, who.userId, who.isOwner, extra.start, extra.end, extra.supplierId, extra.page ?? 1, extra.limit ?? 10),
    );
  const purchasesOf = (who: Who, variant: string, extra: Partial<{ branchId: string; page: number; limit: number; tenantId: string }> = {}) =>
    new GetPurchasesByVariantHandler(db.manager, redisStub).execute(new GetPurchasesByVariantQuery(extra.tenantId ?? shop.tenantId, variant, extra.page ?? 1, extra.limit ?? 10, extra.branchId, who.userId, who.isOwner));
  const kardex = (who: Who, variant: string, extra: Partial<{ branchId: string; page: number; limit: number; tenantId: string }> = {}) =>
    new GetInventoryMovementsByVariantHandler(db.manager, redisStub).execute(
      new GetInventoryMovementsByVariantQuery(extra.tenantId ?? shop.tenantId, variant, extra.page ?? 1, extra.limit ?? 10, extra.branchId, who.userId, who.isOwner),
    );
  const validate = (items: Array<{ sku: string; quantity: number }>, tenantId = shop.tenantId) => new ValidateImportPurchasesHandler(db.manager).execute(new ValidateImportPurchasesQuery(tenantId, items));

  beforeAll(async () => {
    database = await startTestDatabase('purchases_queries');
    db = database.db;
    shop = await seedTenant(db, 'comprasq');
    other = await seedTenant(db, 'comprasq-aj');
    northBranchId = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    cashierId = (await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-cq', password: 'x', isOwner: false }))).id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);
    secondSupplierId = (await db.getRepository(Supplier).save(db.getRepository(Supplier).create({ tenantId: shop.tenantId, identityNumber: 'PROV-2', name: 'Segundo' }))).id;
    variantId = await seedVariant(db, shop.tenantId, 'CQ-1');
    otherVariantId = await seedVariant(db, shop.tenantId, 'CQ-2');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('listado de compras', () => {
    let mainOrder: { id: string };
    let northOrder: { id: string };
    let secondOrder: { id: string };

    beforeAll(async () => {
      mainOrder = await buy(shop.branchId, [{ variantId, quantity: 10, purchasePrice: 4 }], 'F-MAIN');
      northOrder = await buy(northBranchId, [{ variantId, quantity: 5, purchasePrice: 6 }], 'F-NORTH');
      secondOrder = await buy(shop.branchId, [{ variantId: otherVariantId, quantity: 3, purchasePrice: 2 }], 'F-SECOND', secondSupplierId);
    });

    it('el propietario ve las de todas las sucursales, las más recientes primero, con proveedor, ítems y producto', async () => {
      const { data, meta } = await purchases(owner());
      expect(meta).toMatchObject({ total: 3, page: 1, totalPages: 1 });
      expect(data.map((o) => o.invoiceNumber)).toEqual(['F-SECOND', 'F-NORTH', 'F-MAIN']);
      expect(data[0]).toMatchObject({ supplier: { name: 'Segundo' }, branch: { id: shop.branchId } });
      expect(data[2].items[0].variant.product.name).toBe('CQ-1');
    });

    it('filtra por sucursal, por proveedor y por fechas, y pagina', async () => {
      expect((await purchases(owner(), { branchId: northBranchId })).data.map((o) => o.id)).toEqual([northOrder.id]);
      expect((await purchases(owner(), { supplierId: secondSupplierId })).data.map((o) => o.id)).toEqual([secondOrder.id]);
      expect((await purchases(owner(), { page: 2, limit: 2 })).data.map((o) => o.id)).toEqual([mainOrder.id]);

      await db.query(`UPDATE purchase_orders SET created_at = '2020-05-01T12:00:00Z' WHERE id = $1`, [mainOrder.id]);
      expect((await purchases(owner(), { start: '2020-05-01', end: '2020-05-01' })).data.map((o) => o.id)).toEqual([mainOrder.id]);
      await db.query(`UPDATE purchase_orders SET created_at = now() - interval '1 second' WHERE id = $1`, [mainOrder.id]);
    });

    it('una orden se puede cancelar mientras sus lotes estén intactos; deja de poderse al venderse algo o al cancelarse', async () => {
      const find = async (id: string) => (await purchases(owner())).data.find((o) => o.id === id);
      expect((await find(secondOrder.id))?.isCancellable).toBe(true);

      await new AdjustStockHandler(db.manager, redisStub).execute(new AdjustStockCommand(shop.tenantId, shop.ownerId, shop.branchId, otherVariantId, 1, InventoryMovementType.OUT));
      expect((await find(secondOrder.id))?.isCancellable).toBe(false);

      await new CancelPurchaseOrderHandler(db.manager, redisStub).execute(new CancelPurchaseOrderCommand(shop.tenantId, shop.ownerId, northOrder.id));
      expect((await find(northOrder.id))).toMatchObject({ status: 'CANCELLED', isCancellable: false });
      expect((await find(mainOrder.id))?.isCancellable).toBe(true);
    });

    it('quien no es propietario debe indicar una sucursal suya', async () => {
      await expect(purchases(cashier())).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(purchases(cashier(), { branchId: northBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      expect((await purchases(cashier(), { branchId: shop.branchId })).data.every((o) => o.branchId === shop.branchId)).toBe(true);
    });

    it('nunca trae compras de otra tienda', async () => {
      expect((await purchases({ userId: other.ownerId, isOwner: true }, { tenantId: other.tenantId })).meta.total).toBe(0);
    });
  });

  describe('compras y movimientos de una variante', () => {
    it('las compras de una variante respetan sucursal y tienda', async () => {
      expect((await purchasesOf(owner(), variantId)).meta.total).toBe(2);
      expect((await purchasesOf(owner(), variantId, { branchId: shop.branchId })).data.map((o) => o.invoiceNumber)).toEqual(['F-MAIN']);
      await expect(purchasesOf(cashier(), variantId)).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(purchasesOf(cashier(), variantId, { branchId: northBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      expect((await purchasesOf({ userId: other.ownerId, isOwner: true }, variantId, { tenantId: other.tenantId })).data).toEqual([]);
    });

    it('el kardex trae entradas y salidas de la variante, las más recientes primero, con sucursales', async () => {
      const { data, meta } = await kardex(owner(), otherVariantId);
      expect(meta.total).toBe(2);
      expect(data.map((m) => m.type)).toEqual(['OUT', 'IN']);
      expect(data[1]).toMatchObject({ type: 'IN', reason: 'COMPRA', destinationBranch: { id: shop.branchId } });
      expect(data[0]).toMatchObject({ type: 'OUT', originBranch: { id: shop.branchId } });
    });

    it('el kardex filtrado por sucursal incluye lo que entra o sale de ella; quien no es propietario solo ve las suyas', async () => {
      // En Norte entró la compra y salió su cancelación: las dos cuentan para esa sucursal
      const north = await kardex(owner(), variantId, { branchId: northBranchId });
      expect(north.data.map((m) => `${m.type}:${m.reason}`)).toEqual(['OUT:ANULACION_COMPRA', 'IN:COMPRA']);
      expect(north.data.every((m) => m.originBranchId === northBranchId || m.destinationBranchId === northBranchId)).toBe(true);
      await expect(kardex(cashier(), variantId)).rejects.toMatchObject({ code: 'BRANCH_REQUIRED' });
      await expect(kardex(cashier(), variantId, { branchId: northBranchId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      expect((await kardex(cashier(), variantId, { branchId: shop.branchId })).data.every((m) => m.originBranchId === shop.branchId || m.destinationBranchId === shop.branchId)).toBe(true);
    });

    it('el kardex nunca mezcla movimientos de otra tienda', async () => {
      expect((await kardex({ userId: other.ownerId, isOwner: true }, variantId, { tenantId: other.tenantId })).data).toEqual([]);
    });
  });

  describe('validar una importación de compras', () => {
    it('marca los SKUs que no existen y los repetidos, y devuelve el nombre de los válidos', async () => {
      const result = await validate([
        { sku: 'CQ-1', quantity: 2 },
        { sku: 'NO-EXISTE', quantity: 1 },
        { sku: 'CQ-1', quantity: 5 },
        { sku: ' CQ-2 ', quantity: 1 },
      ]);
      expect(result.names).toMatchObject({ 'CQ-1': 'CQ-1', ' CQ-2 ': 'CQ-2' });
      expect(result.errors['NO-EXISTE']).toMatch(/no existe/i);
      expect(result.errors['CQ-1']).toMatch(/duplicado/i);
      expect(result.errors[' CQ-2 ']).toBeUndefined();
    });

    it('una lista vacía no tiene errores y más de 3000 filas se rechaza', async () => {
      expect(await validate([])).toEqual({ errors: {}, names: {} });
      const tooMany = Array.from({ length: 3001 }, (_, i) => ({ sku: `S-${i}`, quantity: 1 }));
      await expect(validate(tooMany)).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED' });
    });

    it('los SKUs de otra tienda no existen para quien valida', async () => {
      await seedVariant(db, other.tenantId, 'SOLO-AJENO');
      expect((await validate([{ sku: 'SOLO-AJENO', quantity: 1 }])).errors['SOLO-AJENO']).toMatch(/no existe/i);
    });
  });

  describe('roles', () => {
    it('lista los de la tienda con el sistema primero y el número de usuarios; el propietario no cuenta', async () => {
      const roleRepo = db.getRepository(Role);
      const system = await roleRepo.save(roleRepo.create({ tenantId: shop.tenantId, name: 'Cajero', permissions: [], isSystem: true }));
      const custom = await roleRepo.save(roleRepo.create({ tenantId: shop.tenantId, name: 'Supervisor', permissions: [], isSystem: false }));
      await roleRepo.save(roleRepo.create({ tenantId: other.tenantId, name: 'De otra tienda', permissions: [], isSystem: false }));
      await db.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [system.id, cashierId]);
      await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Otro', username: 'otro-cq', password: 'x', isOwner: false, roleId: system.id }));
      await db.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [custom.id, shop.ownerId]); // el propietario no cuenta

      const roles = await new ListRolesHandler(db.manager).execute(new ListRolesQuery(shop.tenantId));
      expect(roles.map((r) => r.name)).toEqual(['Cajero', 'Supervisor']);
      expect(roles.map((r) => r.userCount)).toEqual([2, 0]);
      expect((await new ListRolesHandler(db.manager).execute(new ListRolesQuery(other.tenantId))).map((r) => r.name)).toEqual(['De otra tienda']);
    });
  });
});
