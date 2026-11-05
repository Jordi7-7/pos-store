import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Logger, HttpStatus } from '@nestjs/common';
import { UpdateCustomerCommand } from './update-customer.command';
import { Customer } from '../../../domain/entities/customer.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';
import { isConsumerFinal } from '../../../domain/consumer-final';

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

    if (input.identityNumber !== undefined && isConsumerFinal(customer) && input.identityNumber !== customer.identityNumber) {
      throw new AppException(ErrorCode.ConsumerFinalProtected, 'No se puede cambiar el documento del CONSUMIDOR FINAL: es el comprador por defecto de las ventas.', HttpStatus.CONFLICT);
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

    const saved = await this.customerRepository.save(customer).catch((error: unknown) => {
      // Dos peticiones con el mismo documento pasan la comprobación previa a la vez
      if (isUniqueViolation(error)) {
        throw new AppException(ErrorCode.CustomerIdentityTaken, `Ya existe un cliente con el documento ${customer.identityNumber}.`, HttpStatus.CONFLICT, { identityNumber: customer.identityNumber });
      }
      throw error;
    });
    this.logger.log(`Customer ${id} updated for Tenant ${tenantId}`);
    return saved;
  }
}
