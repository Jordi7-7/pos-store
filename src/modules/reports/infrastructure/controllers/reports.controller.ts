import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetReportDto } from '../dtos/get-report.dto';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { GetSalesCostReportQuery } from '../../application/queries/get-sales-cost-report/get-sales-cost-report.query';
import { GetValuedInventoryQuery } from '../../application/queries/get-valued-inventory/get-valued-inventory.query';
import { GetProductSalesReportQuery } from '../../application/queries/get-product-sales-report/get-product-sales-report.query';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';

@Controller('reports')
export class ReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('sales-cost')
  @RequirePermissions(APP_PERMISSIONS.VIEW_REPORTS)
  async getSalesCost(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Query() query: GetReportDto,
  ) {
    return this.queryBus.execute(
      new GetSalesCostReportQuery(
        tenantId,
        query.startDate,
        query.endDate,
        query.branchId || undefined,
        userId,
        userRole,
      ),
    );
  }

  @Get('valued-inventory')
  @RequirePermissions(APP_PERMISSIONS.VIEW_REPORTS)
  async getValuedInventory(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetValuedInventoryQuery(
        tenantId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
        branchId || undefined,
        userId,
        userRole,
      ),
    );
  }

  @Get('product-sales')
  @RequirePermissions(APP_PERMISSIONS.VIEW_REPORTS)
  async getProductSales(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Query() query: GetReportDto,
  ) {
    return this.queryBus.execute(
      new GetProductSalesReportQuery(
        tenantId,
        query.startDate,
        query.endDate,
        query.branchId || undefined,
        userId,
        userRole,
      ),
    );
  }
}
