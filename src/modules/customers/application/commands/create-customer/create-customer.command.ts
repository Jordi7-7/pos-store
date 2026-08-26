import { CreateCustomerDto } from '../../../infrastructure/dtos/create-customer.dto';

export class CreateCustomerCommand {
  constructor(
    public readonly tenantId: string,
    public readonly dto: CreateCustomerDto,
  ) {}
}
