import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from '../../application/services/reports.service';
import { GetReportDto } from '../dtos/get-report.dto';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  async getSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: GetReportDto,
  ) {
    return this.reportsService.getSummary(tenantId, query.startDate, query.endDate);
  }

  @Get('sales-cost')
  async getSalesCost(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: GetReportDto,
  ) {
    return this.reportsService.getSalesCostReport(tenantId, query.startDate, query.endDate);
  }
}
