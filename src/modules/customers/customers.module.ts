import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Customer } from './domain/entities/customer.entity';
import { GetCustomersHandler } from './application/queries/get-customers/get-customers.handler';
import { CustomersController } from './infrastructure/controllers/customers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer]),
    CqrsModule,
  ],
  controllers: [CustomersController],
  providers: [GetCustomersHandler],
})
export class CustomersModule {}
