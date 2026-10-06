import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { GetBatchesQuery } from '../../application/queries/get-batches/get-batches.query';
import { GetBatchesByVariantQuery } from '../../application/queries/get-batches-by-variant/get-batches-by-variant.query';

@Controller('batches')
export class BatchesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('by-variant/:variantId')
  @RequirePermissions(APP_PERMISSIONS.VIEW_PRODUCTS)
  async getBatchesByVariant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetBatchesByVariantQuery(
        tenantId,
        variantId,
        page ? Number(page) : 1,
        limit ? Number(limit) : 10,
        branchId,
      ),
    );
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.VIEW_PRODUCTS)
  async getBatches(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.queryBus.execute(
      new GetBatchesQuery(
        tenantId,
        branchId,
        startDate,
        endDate,
        search,
        page ? Number(page) : 1,
        limit ? Number(limit) : 10,
      ),
    );
  }
}
