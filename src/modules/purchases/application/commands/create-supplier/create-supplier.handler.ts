import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateSupplierCommand } from './create-supplier.command';
import { Supplier } from '../../../domain/entities/supplier.entity';

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
      throw new BadRequestException(`Supplier with identity number "${identityNumber}" already exists`);
    }

    const supplier = new Supplier();
    supplier.tenantId = tenantId;
    supplier.identityNumber = identityNumber;
    supplier.name = name;
    supplier.email = email || null;
    supplier.phone = phone || null;
    supplier.address = address || null;

    const savedSupplier = await supplierRepo.save(supplier);
    this.logger.log(`Supplier created successfully: "${savedSupplier.name}" (ID: ${savedSupplier.id})`);

    return savedSupplier;
  }
}
