import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetReportDto } from '../dtos/get-report.dto';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { GetReportsSummaryQuery } from '../../application/queries/get-reports-summary/get-reports-summary.query';
import { GetSalesCostReportQuery } from '../../application/queries/get-sales-cost-report/get-sales-cost-report.query';
import { GetValuedInventoryQuery } from '../../application/queries/get-valued-inventory/get-valued-inventory.query';

@Controller('reports')
export class ReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('summary')
  async getSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: GetReportDto,
  ) {
    return this.queryBus.execute(
      new GetReportsSummaryQuery(tenantId, query.startDate, query.endDate),
    );
  }

  @Get('sales-cost')
  async getSalesCost(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: GetReportDto,
  ) {
    return this.queryBus.execute(
      new GetSalesCostReportQuery(tenantId, query.startDate, query.endDate),
    );
  }

  @Get('valued-inventory')
  async getValuedInventory(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.queryBus.execute(
      new GetValuedInventoryQuery(
        tenantId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
      ),
    );
  }
}
