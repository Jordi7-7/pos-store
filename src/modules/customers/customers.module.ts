import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Customer } from './domain/entities/customer.entity';
import { GetCustomersHandler } from './application/queries/get-customers/get-customers.handler';
import { CustomersController } from './infrastructure/controllers/customers.controller';

import { CreateCustomerHandler } from './application/commands/create-customer/create-customer.handler';
import { UpdateCustomerHandler } from './application/commands/update-customer/update-customer.handler';
import { DeleteCustomerHandler } from './application/commands/delete-customer/delete-customer.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer]),
    CqrsModule,
  ],
  controllers: [CustomersController],
  providers: [
    GetCustomersHandler,
    CreateCustomerHandler,
    UpdateCustomerHandler,
    DeleteCustomerHandler,
  ],
})
export class CustomersModule {}
