import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DashboardController } from './infrastructure/controllers/dashboard.controller';
import { GetDashboardMetricsHandler } from './application/queries/get-dashboard-metrics/get-dashboard-metrics.handler';

@Module({
  imports: [CqrsModule],
  controllers: [DashboardController],
  providers: [GetDashboardMetricsHandler],
})
export class DashboardModule {}
