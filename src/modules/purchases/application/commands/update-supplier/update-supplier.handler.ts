import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Logger, HttpStatus } from '@nestjs/common';
import { UpdateSupplierCommand } from './update-supplier.command';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';

@CommandHandler(UpdateSupplierCommand)
export class UpdateSupplierHandler implements ICommandHandler<UpdateSupplierCommand> {
  private readonly logger = new Logger(UpdateSupplierHandler.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  async execute(command: UpdateSupplierCommand): Promise<Supplier> {
    const { tenantId, id, input } = command;

    const supplier = await this.supplierRepository.findOne({
      where: { id, tenantId },
    });
    if (!supplier) {
      throw new AppException(ErrorCode.SupplierNotFound, 'Proveedor no encontrado.', HttpStatus.NOT_FOUND, { id });
    }

    if (input.identityNumber !== undefined) {
      const existing = await this.supplierRepository.findOne({
        where: { tenantId, identityNumber: input.identityNumber, id: Not(id) },
      });
      if (existing) {
        throw new AppException(ErrorCode.SupplierIdentityTaken, `Ya existe un proveedor con el documento "${input.identityNumber}".`, HttpStatus.CONFLICT, { identityNumber: input.identityNumber });
      }
      supplier.identityNumber = input.identityNumber;
    }

    if (input.name !== undefined) {
      supplier.name = input.name;
    }
    if (input.email !== undefined) {
      supplier.email = input.email || null;
    }
    if (input.phone !== undefined) {
      supplier.phone = input.phone || null;
    }
    if (input.address !== undefined) {
      supplier.address = input.address || null;
    }

    const saved = await this.supplierRepository.save(supplier).catch((error: unknown) => {
      // Dos peticiones con el mismo documento pasan la comprobación previa a la vez
      if (isUniqueViolation(error)) {
        throw new AppException(ErrorCode.SupplierIdentityTaken, `Ya existe un proveedor con el documento "${supplier.identityNumber}".`, HttpStatus.CONFLICT, { identityNumber: supplier.identityNumber });
      }
      throw error;
    });
    this.logger.log(`Supplier updated successfully: ${saved.name} (${saved.id})`);
    return saved;
  }
}
