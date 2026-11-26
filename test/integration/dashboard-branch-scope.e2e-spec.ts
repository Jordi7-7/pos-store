import { DataSource } from 'typeorm';
import { DashboardReadQueries } from '../../src/modules/dashboard/application/queries/get-dashboard-metrics/dashboard-read-queries';
import { GetDashboardMetricsHandler } from '../../src/modules/dashboard/application/queries/get-dashboard-metrics/get-dashboard-metrics.handler';
import { GetDashboardMetricsQuery } from '../../src/modules/dashboard/application/queries/get-dashboard-metrics/get-dashboard-metrics.query';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { CashSession } from '../../src/modules/sales/domain/entities/cash-session.entity';
import { CashSessionStatus } from '../../src/modules/sales/domain/enums/cash-session-status.enum';
import { Sale } from '../../src/modules/sales/domain/entities/sale.entity';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** El panel solo agrega las sucursales que el usuario puede ver. */
describe('Panel: alcance por sucursales', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let matriz: string;
  let norte: string;
  let cashierId: string;
  let loneCashierId: string;

  const metrics = (userId: string, isOwner: boolean, branchId?: string) =>
    new GetDashboardMetricsHandler(db.manager, new DashboardReadQueries(db.manager), redisStub).execute(new GetDashboardMetricsQuery(shop.tenantId, userId, isOwner, branchId));

  /** Un turno abierto en la sucursal con una venta del total indicado. */
  const sellIn = async (branchId: string, total: number) => {
    const registerId = (
      await db.query<Array<{ id: string }>>(`INSERT INTO cash_registers (tenant_id, branch_id, name, code) VALUES ($1, $2, 'C', 1) RETURNING id`, [shop.tenantId, branchId])
    )[0].id;
    const session = await db.getRepository(CashSession).save(
      db.getRepository(CashSession).create({ branchId, userId: shop.ownerId, cashRegisterId: registerId, openingBalance: 0, status: CashSessionStatus.OPEN, openedAt: new Date() }),
    );
    await db.getRepository(Sale).save(db.getRepository(Sale).create({ tenantId: shop.tenantId, branchId, cashSessionId: session.id, subtotal: total, total, userId: shop.ownerId }));
  };

  beforeAll(async () => {
    database = await startTestDatabase('dashboard-scope');
    db = database.db;
    shop = await seedTenant(db, 'panel');
    matriz = shop.branchId;
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    await sellIn(matriz, 10);
    await sellIn(norte, 30);

    const cashier = await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-panel', password: 'x', isOwner: false }));
    cashierId = cashier.id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, matriz]);
    loneCashierId = (await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Sin sucursal', username: 'sin-suc-panel', password: 'x', isOwner: false }))).id;
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('el propietario sin elegir sucursal ve la suma de todas, y puede elegir una', async () => {
    expect((await metrics(shop.ownerId, true)).today.totalSales).toBe(40);
    expect((await metrics(shop.ownerId, true, norte)).today.totalSales).toBe(30);
  });

  it('quien no es propietario, sin elegir sucursal, ve solo la suma de las suyas', async () => {
    const result = await metrics(cashierId, false);

    expect(result.today.totalSales).toBe(10);
    expect(result.weekSummary.totalWeek).toBe(10);
  });

  it('pedir una sucursal ajena se rechaza con 403 y no devuelve cifras', async () => {
    await expect(metrics(cashierId, false, norte)).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    await expect(metrics(cashierId, false, matriz)).resolves.toMatchObject({ today: { totalSales: 10 } });
  });

  it('sin ninguna sucursal asignada no ve nada', async () => {
    expect((await metrics(loneCashierId, false)).today.totalSales).toBe(0);
  });
});
