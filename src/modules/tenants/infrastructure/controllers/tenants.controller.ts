import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UpdateTenantDto } from '../dtos/update-tenant.dto';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { GetTenantMetadataQuery } from '../../application/queries/get-tenant-metadata/get-tenant-metadata.query';
import { GetTenantQuery } from '../../application/queries/get-tenant/get-tenant.query';
import { UpdateTenantCommand } from '../../application/commands/update-tenant/update-tenant.command';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

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
