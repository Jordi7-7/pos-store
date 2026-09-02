import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UpdateTenantDto } from '../dtos/update-tenant.dto';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';
import { GetTenantMetadataQuery } from '../../application/queries/get-tenant-metadata/get-tenant-metadata.query';
import { GetTenantQuery } from '../../application/queries/get-tenant/get-tenant.query';
import { GetPublicTenantBySlugQuery } from '../../application/queries/get-public-tenant-by-slug/get-public-tenant-by-slug.query';
import { UpdateTenantCommand } from '../../application/commands/update-tenant/update-tenant.command';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Public()
  @Get('public/:slug')
  async getPublicBySlug(@Param('slug') slug: string) {
    return this.queryBus.execute(new GetPublicTenantBySlugQuery(slug));
  }

  @Get('metadata')
  async getMetadata() {
    return this.queryBus.execute(new GetTenantMetadataQuery());
  }

  @Get('current')
  async getCurrent(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetTenantQuery(tenantId));
  }

  @Put('current')
  async updateCurrent(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.commandBus.execute(new UpdateTenantCommand(tenantId, dto));
  }
}
