import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetCustomersQuery } from '../../application/queries/get-customers/get-customers.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

@Controller('customers')
export class CustomersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetCustomersQuery(tenantId));
  }
}
