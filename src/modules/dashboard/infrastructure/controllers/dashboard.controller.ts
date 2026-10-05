import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { GetDashboardMetricsQuery } from '../../application/queries/get-dashboard-metrics/get-dashboard-metrics.query';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('metrics')
  @RequirePermissions(APP_PERMISSIONS.VIEW_DASHBOARD)
  async getMetrics(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetDashboardMetricsQuery(tenantId, branchId || undefined),
    );
  }
}
