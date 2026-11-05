import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { UpdateSupplierCommand } from './update-supplier.command';
import { Supplier } from '../../../domain/entities/supplier.entity';

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
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    if (input.identityNumber !== undefined) {
      const existing = await this.supplierRepository.findOne({
        where: { tenantId, identityNumber: input.identityNumber, id: Not(id) },
      });
      if (existing) {
        throw new BadRequestException(`Supplier with identity number "${input.identityNumber}" already exists`);
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

    const saved = await this.supplierRepository.save(supplier);
    this.logger.log(`Supplier updated successfully: ${saved.name} (${saved.id})`);
    return saved;
  }
}
