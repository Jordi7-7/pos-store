import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { TenantsService } from '../../application/services/tenants.service';
import { UpdateTenantDto } from '../dtos/update-tenant.dto';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('metadata')
  async getMetadata() {
    return this.tenantsService.getMetadata();
  }

  @Get('current')
  async getCurrent(@CurrentUser('tenantId') tenantId: string) {
    return this.tenantsService.findOne(tenantId);
  }

  @Put('current')
  async updateCurrent(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(tenantId, dto);
  }
}
