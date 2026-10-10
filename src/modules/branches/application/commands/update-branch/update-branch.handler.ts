import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager, Not } from 'typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UpdateBranchCommand } from './update-branch.command';
import { Branch } from '../../../domain/entities/branch.entity';

@CommandHandler(UpdateBranchCommand)
export class UpdateBranchHandler implements ICommandHandler<UpdateBranchCommand> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateBranchCommand): Promise<Branch> {
    const { tenantId, branchId, name, address, isActive } = command;
    const branchRepo = this.entityManager.getRepository(Branch);

    const branch = await branchRepo.findOne({
      where: { id: branchId, tenantId },
    });
    if (!branch) {
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

    return branchRepo.save(branch);
  }
}
