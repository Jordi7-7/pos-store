import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, Logger } from '@nestjs/common';
import { CreateCustomerCommand } from './create-customer.command';
import { Customer } from '../../../domain/entities/customer.entity';

@CommandHandler(CreateCustomerCommand)
export class CreateCustomerHandler implements ICommandHandler<CreateCustomerCommand> {
  private readonly logger = new Logger(CreateCustomerHandler.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async execute(command: CreateCustomerCommand): Promise<Customer> {
    const { tenantId, input } = command;
    this.logger.log(`Creating customer for Tenant ${tenantId}`);

    const existing = await this.customerRepository.findOne({
      where: { tenantId, identityNumber: input.identityNumber },
    });
    if (existing) {
      this.logger.warn(`Customer creation rejected: duplicate identity number in Tenant ${tenantId}`);
      throw new BadRequestException(`Customer with identity number ${input.identityNumber} already exists`);
    }

    const customer = new Customer();
    customer.tenantId = tenantId;
    customer.identityNumber = input.identityNumber;
    customer.name = input.name;
    customer.email = input.email?.trim() ? input.email.trim() : null;
    customer.phone = input.phone?.trim() ? input.phone.trim() : null;

    const saved = await this.customerRepository.save(customer);
    this.logger.log(`Customer ${saved.id} created for Tenant ${tenantId}`);
    return saved;
  }
}
