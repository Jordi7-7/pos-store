import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DashboardController } from './infrastructure/controllers/dashboard.controller';
import { DashboardReadQueries } from './application/queries/get-dashboard-metrics/dashboard-read-queries';
import { GetDashboardMetricsHandler } from './application/queries/get-dashboard-metrics/get-dashboard-metrics.handler';

@Module({
  imports: [CqrsModule],
  controllers: [DashboardController],
  providers: [DashboardReadQueries, GetDashboardMetricsHandler],
})
export class DashboardModule {}
