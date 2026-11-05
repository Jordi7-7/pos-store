import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager, Not } from 'typeorm';
import { NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { UpdateBranchCommand } from './update-branch.command';
import { Branch } from '../../../domain/entities/branch.entity';

@CommandHandler(UpdateBranchCommand)
export class UpdateBranchHandler implements ICommandHandler<UpdateBranchCommand> {
  private readonly logger = new Logger(UpdateBranchHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateBranchCommand): Promise<Branch> {
    const { tenantId, branchId, name, address, isActive } = command;
    this.logger.log(`Updating branch ${branchId} for Tenant ${tenantId}`);
    const branchRepo = this.entityManager.getRepository(Branch);

    const branch = await branchRepo.findOne({
      where: { id: branchId, tenantId },
    });
    if (!branch) {
      this.logger.warn(`Branch update rejected: ${branchId} not found in Tenant ${tenantId}`);
      throw new NotFoundException('Sucursal no encontrada.');
    }

    if (name !== undefined && name.trim() !== '') {
      const existing = await branchRepo.findOne({
        where: {
          tenantId,
          name: name.trim(),
          id: Not(branchId),
        },
      });
      if (existing) {
        this.logger.warn(`Branch update rejected: duplicate name for ${branchId} in Tenant ${tenantId}`);
        throw new ConflictException(`Ya existe otra sucursal con el nombre "${name.trim()}".`);
      }
      branch.name = name.trim();
    }

    if (address !== undefined) {
      branch.address = address.trim();
    }

    if (isActive !== undefined) {
      branch.isActive = isActive;
    }

    const saved = await branchRepo.save(branch);
    this.logger.log(`Branch ${branchId} updated for Tenant ${tenantId}`);
    return saved;
  }
}
