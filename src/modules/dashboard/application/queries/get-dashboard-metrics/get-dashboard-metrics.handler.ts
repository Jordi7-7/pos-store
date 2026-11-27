import { publicBaseUrl } from '../../../../../common/storage/public-url';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { DateTime } from 'luxon';
import { GetDashboardMetricsQuery } from './get-dashboard-metrics.query';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { DashboardMetricsDto } from './dashboard-metrics.read-model';
import { resolveTimezone } from '../../../../../common/utils/timezone';
import { assertUserCanAccessBranch, visibleBranchIds } from '../../../../../common/security/branch-access.helper';
import { dashboardPeriods } from './dashboard-periods';
import { DashboardReadQueries, DashboardScope } from './dashboard-read-queries';
import {
  buildLowStockProducts,
  buildPaymentMethods,
  buildToday,
  buildTopProducts,
  buildWeekSummary,
  buildYesterdaySoldProducts,
} from './dashboard-summary';

export type { DashboardMetricsDto } from './dashboard-metrics.read-model';

@QueryHandler(GetDashboardMetricsQuery)
export class GetDashboardMetricsHandler implements IQueryHandler<GetDashboardMetricsQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly reads: DashboardReadQueries,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetDashboardMetricsQuery): Promise<DashboardMetricsDto> {
    const scope = await this.scopeOf(query);

    // Hoy, ayer y la semana se calculan en la zona horaria del tenant
    const timezone = await this.timezoneOf(scope.tenantId);
    const periods = dashboardPeriods(DateTime.now().setZone(timezone));

    const [sales, refunds, payments, topProducts, lowStock, soldYesterday, currentWeek, previousWeekTotal] = await Promise.all([
      this.reads.salesInRange(scope, periods.today),
      this.reads.refundsInRange(scope, periods.today),
      this.reads.paymentsInRange(scope, periods.today),
      this.reads.topProducts(scope, periods.topProductsSince),
      this.reads.lowStockProducts(scope, periods.lowStockActivitySince),
      this.reads.soldInRangeWithStock(scope, periods.yesterday),
      this.reads.dailySales(scope, periods.week, timezone),
      this.reads.salesTotalInRange(scope, periods.previousWeek),
    ]);

    return {
      today: buildToday(sales, refunds),
      paymentMethods: buildPaymentMethods(payments),
      topProducts: buildTopProducts(topProducts, publicBaseUrl()),
      lowStockProducts: buildLowStockProducts(lowStock),
      yesterdaySoldProducts: buildYesterdaySoldProducts(soldYesterday),
      weekSummary: buildWeekSummary(currentWeek, previousWeekTotal),
    };
  }

  /** Una sucursal elegida (si el usuario puede verla), o, sin elegir, todas las que puede ver (todas las de la tienda si es propietario). */
  private async scopeOf(query: GetDashboardMetricsQuery): Promise<DashboardScope> {
    const { tenantId, userId, isOwner, branchId } = query;
    if (branchId) {
      await assertUserCanAccessBranch(this.entityManager, this.redisService, { userId, isOwner, branchId, actionDescription: 'ver el panel' });
      return { tenantId, branchIds: [branchId] };
    }
    return { tenantId, branchIds: await visibleBranchIds(this.entityManager, this.redisService, { userId, isOwner }) };
  }

  private async timezoneOf(tenantId: string): Promise<string> {
    const tenant = await this.entityManager.getRepository(Tenant).findOne({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return resolveTimezone(tenant?.timezone);
  }
}
