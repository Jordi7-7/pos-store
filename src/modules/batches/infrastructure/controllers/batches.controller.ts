import { HttpStatus, Controller, Get, Param, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { GetBatchesQuery } from '../../application/queries/get-batches/get-batches.query';
import { GetBatchesByVariantQuery } from '../../application/queries/get-batches-by-variant/get-batches-by-variant.query';
import { BatchOriginType } from '../../domain/entities/batch.entity';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { parseLimit, parsePage } from '../../../../common/utils/pagination';

/** `originTypes=PURCHASE,REFUND` → lista validada; un valor desconocido se rechaza en vez de ignorarse. */
function parseOriginTypes(raw?: string): BatchOriginType[] | undefined {
  const values = (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) return undefined;
  const known = Object.values(BatchOriginType) as string[];
  const unknown = values.filter((value) => !known.includes(value));
  if (unknown.length > 0) {
    throw new AppException(ErrorCode.ValidationFailed, `Tipo de lote no válido: ${unknown.join(', ')}.`, HttpStatus.BAD_REQUEST, { originTypes: unknown });
  }
  return [...new Set(values)] as BatchOriginType[];
}

@Controller('batches')
export class BatchesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('by-variant/:variantId')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_GET)
  async getBatchesByVariant(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Param('variantId') variantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetBatchesByVariantQuery(
        tenantId,
        variantId,
        parsePage(page),
        parseLimit(limit),
        branchId,
        userId,
        isOwner,
      ),
    );
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_GET)
  async getBatches(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('originTypes') originTypes?: string,
  ) {
    return this.queryBus.execute(
      new GetBatchesQuery(
        tenantId,
        branchId,
        startDate,
        endDate,
        search,
        parsePage(page),
        parseLimit(limit),
        userId,
        isOwner,
        parseOriginTypes(originTypes),
      ),
    );
  }
}
