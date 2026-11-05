import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, Logger } from '@nestjs/common';
import { DeleteCustomerCommand } from './delete-customer.command';
import { Customer } from '../../../domain/entities/customer.entity';

@CommandHandler(DeleteCustomerCommand)
export class DeleteCustomerHandler implements ICommandHandler<DeleteCustomerCommand> {
  private readonly logger = new Logger(DeleteCustomerHandler.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async execute(command: DeleteCustomerCommand): Promise<{ message: string }> {
    const { tenantId, id } = command;
    this.logger.log(`Deleting customer ${id} for Tenant ${tenantId}`);

    const customer = await this.customerRepository.findOne({
      where: { id, tenantId },
    });
    if (!customer) {
      this.logger.warn(`Customer deletion rejected: ${id} not found in Tenant ${tenantId}`);
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    await this.customerRepository.softRemove(customer);
    this.logger.log(`Customer ${id} soft-deleted for Tenant ${tenantId}`);
    return { message: 'Customer soft-deleted successfully' };
  }
}
