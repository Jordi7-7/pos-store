import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetReportDto } from '../dtos/get-report.dto';
import { GetValuedInventoryDto } from '../dtos/get-valued-inventory.dto';
import { parseLimit } from '../../../../common/utils/pagination';
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
  @RequirePermissions(APP_PERMISSIONS.REPORTS_GET)
  async getSalesCost(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query() query: GetReportDto,
  ) {
    return this.queryBus.execute(
      new GetSalesCostReportQuery(
        tenantId,
        query.startDate,
        query.endDate,
        query.branchId || undefined,
        userId,
        isOwner,
      ),
    );
  }

  @Get('valued-inventory')
  @RequirePermissions(APP_PERMISSIONS.REPORTS_GET)
  async getValuedInventory(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query() query: GetValuedInventoryDto,
  ) {
    return this.queryBus.execute(
      new GetValuedInventoryQuery(
        tenantId,
        query.page,
        query.limit === undefined ? undefined : parseLimit(query.limit),
        query.branchId,
        userId,
        isOwner,
      ),
    );
  }

  @Get('product-sales')
  @RequirePermissions(APP_PERMISSIONS.REPORTS_GET)
  async getProductSales(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query() query: GetReportDto,
  ) {
    return this.queryBus.execute(
      new GetProductSalesReportQuery(
        tenantId,
        query.startDate,
        query.endDate,
        query.branchId || undefined,
        userId,
        isOwner,
      ),
    );
  }
}
