import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { DashboardMetricsQueryDto } from '../dtos/dashboard-query.dto';
import { DashboardMetricsDto } from '../../application/queries/get-dashboard-metrics/dashboard-metrics.read-model';
import { GetDashboardMetricsQuery } from '../../application/queries/get-dashboard-metrics/get-dashboard-metrics.query';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('metrics')
  @RequirePermissions(APP_PERMISSIONS.DASHBOARD_GET)
  async getMetrics(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: DashboardMetricsQueryDto,
  ) {
    return this.queryBus.execute<GetDashboardMetricsQuery, DashboardMetricsDto>(
      new GetDashboardMetricsQuery(tenantId, query.branchId),
    );
  }
}
