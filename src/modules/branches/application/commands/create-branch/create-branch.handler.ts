import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { CreateBranchCommand } from './create-branch.command';
import { Branch } from '../../../domain/entities/branch.entity';

@CommandHandler(CreateBranchCommand)
export class CreateBranchHandler implements ICommandHandler<CreateBranchCommand> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateBranchCommand): Promise<Branch> {
    const { tenantId, name, address, isActive } = command;

    return this.entityManager.transaction(async (manager) => {
      const branchRepo = manager.getRepository(Branch);

      // Validate unique name per tenant
      const existing = await branchRepo.findOne({
        where: { tenantId, name: name.trim() },
      });
      if (existing) {
        throw new ConflictException(`Ya existe una sucursal con el nombre "${name.trim()}".`);
      }

      // Calculate sequential branch code
      const count = await branchRepo.count({ where: { tenantId } });
      const nextCode = count + 1;

      const branch = branchRepo.create({
        tenantId,
        name: name.trim(),
        address: address.trim(),
        code: nextCode,
        isActive: isActive !== undefined ? isActive : true,
      });

      return branchRepo.save(branch);
    });
  }
}
