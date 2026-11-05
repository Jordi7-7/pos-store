import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { DateTime } from 'luxon';
import { GetDashboardMetricsQuery } from './get-dashboard-metrics.query';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { DashboardMetricsDto } from './dashboard-metrics.read-model';
import { dashboardPeriods, resolveTimezone } from './dashboard-periods';
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
  ) {}

  async execute(query: GetDashboardMetricsQuery): Promise<DashboardMetricsDto> {
    const scope: DashboardScope = { tenantId: query.tenantId, branchId: query.branchId };

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
      topProducts: buildTopProducts(topProducts, process.env.AWS_S3_PUBLIC_URL || ''),
      lowStockProducts: buildLowStockProducts(lowStock),
      yesterdaySoldProducts: buildYesterdaySoldProducts(soldYesterday),
      weekSummary: buildWeekSummary(currentWeek, previousWeekTotal),
    };
  }

  private async timezoneOf(tenantId: string): Promise<string> {
    const tenant = await this.entityManager.getRepository(Tenant).findOne({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return resolveTimezone(tenant?.timezone);
  }
}
