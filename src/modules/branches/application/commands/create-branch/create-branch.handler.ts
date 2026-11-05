import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { Logger, HttpStatus } from '@nestjs/common';
import { CreateBranchCommand } from './create-branch.command';
import { Branch } from '../../../domain/entities/branch.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(CreateBranchCommand)
export class CreateBranchHandler implements ICommandHandler<CreateBranchCommand> {
  private readonly logger = new Logger(CreateBranchHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateBranchCommand): Promise<Branch> {
    const { tenantId, name, address, isActive } = command;
    this.logger.log(`Creating branch for Tenant ${tenantId}`);

    const saved = await this.entityManager.transaction(async (manager) => {
      const branchRepo = manager.getRepository(Branch);

      // Validate unique name per tenant
      const existing = await branchRepo.findOne({
        where: { tenantId, name: name.trim() },
      });
      if (existing) {
        this.logger.warn(`Branch creation rejected: duplicate name in Tenant ${tenantId}`);
        throw new AppException(ErrorCode.BranchNameTaken, `Ya existe una sucursal con el nombre "${name.trim()}".`, HttpStatus.CONFLICT, { name: name.trim() });
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

    this.logger.log(`Branch ${saved.id} created for Tenant ${tenantId}`);
    return saved;
  }
}
