import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Logger, HttpStatus } from '@nestjs/common';
import { UpdateCustomerCommand } from './update-customer.command';
import { Customer } from '../../../domain/entities/customer.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(UpdateCustomerCommand)
export class UpdateCustomerHandler implements ICommandHandler<UpdateCustomerCommand> {
  private readonly logger = new Logger(UpdateCustomerHandler.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async execute(command: UpdateCustomerCommand): Promise<Customer> {
    const { tenantId, id, input } = command;
    this.logger.log(`Updating customer ${id} for Tenant ${tenantId}`);

    const customer = await this.customerRepository.findOne({
      where: { id, tenantId },
    });
    if (!customer) {
      this.logger.warn(`Customer update rejected: ${id} not found in Tenant ${tenantId}`);
      throw new AppException(ErrorCode.CustomerNotFound, 'Cliente no encontrado.', HttpStatus.NOT_FOUND, { id });
    }

    if (input.identityNumber !== undefined) {
      const existing = await this.customerRepository.findOne({
        where: { tenantId, identityNumber: input.identityNumber, id: Not(id) },
      });
      if (existing) {
        this.logger.warn(`Customer update rejected: duplicate identity number for ${id} in Tenant ${tenantId}`);
        throw new AppException(ErrorCode.CustomerIdentityTaken, `Ya existe un cliente con el documento ${input.identityNumber}.`, HttpStatus.CONFLICT, { identityNumber: input.identityNumber });
      }
      customer.identityNumber = input.identityNumber;
    }

    if (input.name !== undefined) {
      customer.name = input.name;
    }
    if (input.email !== undefined) {
      customer.email = input.email?.trim() ? input.email.trim() : null;
    }
    if (input.phone !== undefined) {
      customer.phone = input.phone?.trim() ? input.phone.trim() : null;
    }

    const saved = await this.customerRepository.save(customer);
    this.logger.log(`Customer ${id} updated for Tenant ${tenantId}`);
    return saved;
  }
}
