import { UpdateCustomerDto } from '../../../infrastructure/dtos/update-customer.dto';

export class UpdateCustomerCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly dto: UpdateCustomerDto,
  ) {}
}
