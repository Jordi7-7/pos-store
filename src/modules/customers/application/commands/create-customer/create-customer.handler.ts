import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger, HttpStatus } from '@nestjs/common';
import { CreateCustomerCommand } from './create-customer.command';
import { Customer } from '../../../domain/entities/customer.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';

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
      throw new AppException(ErrorCode.CustomerIdentityTaken, `Ya existe un cliente con el documento ${input.identityNumber}.`, HttpStatus.CONFLICT, { identityNumber: input.identityNumber });
    }

    const customer = new Customer();
    customer.tenantId = tenantId;
    customer.identityNumber = input.identityNumber;
    customer.name = input.name;
    customer.email = input.email?.trim() ? input.email.trim() : null;
    customer.phone = input.phone?.trim() ? input.phone.trim() : null;

    const saved = await this.customerRepository.save(customer).catch((error: unknown) => {
      // Dos peticiones con el mismo documento pasan la comprobación previa a la vez
      if (isUniqueViolation(error)) {
        throw new AppException(ErrorCode.CustomerIdentityTaken, `Ya existe un cliente con el documento ${customer.identityNumber}.`, HttpStatus.CONFLICT, { identityNumber: customer.identityNumber });
      }
      throw error;
    });
    this.logger.log(`Customer ${saved.id} created for Tenant ${tenantId}`);
    return saved;
  }
}
