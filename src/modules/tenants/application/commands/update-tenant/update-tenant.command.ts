import { UpdateTenantDto } from '../../../infrastructure/dtos/update-tenant.dto';

export class UpdateTenantCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateTenantDto,
  ) {}
}
