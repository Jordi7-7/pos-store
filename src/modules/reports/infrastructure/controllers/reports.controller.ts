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
    const start = query.startDate 
      ? new Date(query.startDate) 
      : new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
      
    const end = query.endDate 
      ? new Date(query.endDate) 
      : new Date();

    // Adjust hours to cover the entire selected days
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);

    return this.reportsService.getSummary(tenantId, start, end);
  }
}
