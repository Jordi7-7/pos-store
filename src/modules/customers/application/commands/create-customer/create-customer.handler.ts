import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { CreateCustomerCommand } from './create-customer.command';
import { Customer } from '../../../domain/entities/customer.entity';

@CommandHandler(CreateCustomerCommand)
export class CreateCustomerHandler implements ICommandHandler<CreateCustomerCommand> {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async execute(command: CreateCustomerCommand): Promise<Customer> {
    const { tenantId, dto } = command;

    const existing = await this.customerRepository.findOne({
      where: { tenantId, identityNumber: dto.identityNumber },
    });
    if (existing) {
      throw new BadRequestException(`Customer with identity number ${dto.identityNumber} already exists`);
    }

    const customer = new Customer();
    customer.tenantId = tenantId;
    customer.identityNumber = dto.identityNumber;
    customer.name = dto.name;
    customer.email = dto.email || '';
    customer.phone = dto.phone || '';

    return this.customerRepository.save(customer);
  }
}
