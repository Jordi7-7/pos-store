import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateSupplierCommand } from './create-supplier.command';
import { Supplier } from '../../../domain/entities/supplier.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';

@CommandHandler(CreateSupplierCommand)
export class CreateSupplierHandler implements ICommandHandler<CreateSupplierCommand> {
  private readonly logger = new Logger(CreateSupplierHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateSupplierCommand): Promise<Supplier> {
    const { tenantId, identityNumber, name, email, phone, address } = command;
    this.logger.log(`Creating supplier: "${name}" (${identityNumber}) for Tenant: ${tenantId}`);

    const supplierRepo = this.entityManager.getRepository(Supplier);

    // Verify uniqueness for active suppliers in this tenant
    const existing = await supplierRepo.findOne({
      where: {
        tenantId,
        identityNumber,
      },
    });

    if (existing) {
      this.logger.warn(`Supplier creation failed: Identity Number ${identityNumber} already exists for Tenant ${tenantId}`);
      throw new AppException(ErrorCode.SupplierIdentityTaken, `Ya existe un proveedor con el documento "${identityNumber}".`, HttpStatus.CONFLICT, { identityNumber });
    }

    const supplier = new Supplier();
    supplier.tenantId = tenantId;
    supplier.identityNumber = identityNumber;
    supplier.name = name;
    supplier.email = email || null;
    supplier.phone = phone || null;
    supplier.address = address || null;

    const savedSupplier = await supplierRepo.save(supplier).catch((error: unknown) => {
      // Dos peticiones con el mismo documento pasan la comprobación previa a la vez
      if (isUniqueViolation(error)) {
        throw new AppException(ErrorCode.SupplierIdentityTaken, `Ya existe un proveedor con el documento "${supplier.identityNumber}".`, HttpStatus.CONFLICT, { identityNumber: supplier.identityNumber });
      }
      throw error;
    });
    this.logger.log(`Supplier created successfully: "${savedSupplier.name}" (ID: ${savedSupplier.id})`);

    return savedSupplier;
  }
}
