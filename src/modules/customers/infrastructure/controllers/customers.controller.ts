import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetCustomersQuery } from '../../application/queries/get-customers/get-customers.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { CreateCustomerDto } from '../dtos/create-customer.dto';
import { UpdateCustomerDto } from '../dtos/update-customer.dto';
import { CreateCustomerCommand } from '../../application/commands/create-customer/create-customer.command';
import { UpdateCustomerCommand } from '../../application/commands/update-customer/update-customer.command';
import { DeleteCustomerCommand } from '../../application/commands/delete-customer/delete-customer.command';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  async findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetCustomersQuery(tenantId));
  }

  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.commandBus.execute(new CreateCustomerCommand(tenantId, dto));
  }

  @Put(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.commandBus.execute(new UpdateCustomerCommand(tenantId, id, dto));
  }

  @Delete(':id')
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.commandBus.execute(new DeleteCustomerCommand(tenantId, id));
  }
}
