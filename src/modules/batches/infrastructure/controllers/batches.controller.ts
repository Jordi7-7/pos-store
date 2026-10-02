import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { GetBatchesQuery } from '../../application/queries/get-batches/get-batches.query';

@Controller('batches')
export class BatchesController {
  constructor(private readonly queryBus: QueryBus) {}

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
