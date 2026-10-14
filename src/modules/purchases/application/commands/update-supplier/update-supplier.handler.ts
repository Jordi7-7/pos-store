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
    const { tenantId, id, dto } = command;

    const supplier = await this.supplierRepository.findOne({
      where: { id, tenantId },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    if (dto.identityNumber !== undefined) {
      const existing = await this.supplierRepository.findOne({
        where: { tenantId, identityNumber: dto.identityNumber, id: Not(id) },
      });
      if (existing) {
        throw new BadRequestException(`Supplier with identity number "${dto.identityNumber}" already exists`);
      }
      supplier.identityNumber = dto.identityNumber;
    }

    if (dto.name !== undefined) {
      supplier.name = dto.name;
    }
    if (dto.email !== undefined) {
      supplier.email = dto.email || null;
    }
    if (dto.phone !== undefined) {
      supplier.phone = dto.phone || null;
    }
    if (dto.address !== undefined) {
      supplier.address = dto.address || null;
    }

    const saved = await this.supplierRepository.save(supplier);
    this.logger.log(`Supplier updated successfully: ${saved.name} (${saved.id})`);
    return saved;
  }
}
