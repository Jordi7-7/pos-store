import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateCashRegisterCommand } from './create-cash-register.command';
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';

@CommandHandler(CreateCashRegisterCommand)
export class CreateCashRegisterHandler implements ICommandHandler<CreateCashRegisterCommand> {
  private readonly logger = new Logger(CreateCashRegisterHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateCashRegisterCommand): Promise<CashRegister> {
    const { tenantId, branchId, name } = command;
    this.logger.log(`Creating cash register "${name}" for Branch: ${branchId}, Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const branchRepo = transactionalManager.getRepository(Branch);
      const registerRepo = transactionalManager.getRepository(CashRegister);

      const branch = await branchRepo.findOne({
        where: { id: branchId, tenantId },
      });
      if (!branch) {
        throw new NotFoundException('Sucursal no encontrada');
      }

      // Obtener el código correlativo más alto dentro de la sucursal
      const maxRegister = await registerRepo
        .createQueryBuilder('cr')
        .where('cr.tenantId = :tenantId AND cr.branchId = :branchId', {
          tenantId,
          branchId,
        })
        .orderBy('cr.code', 'DESC')
        .getOne();

      const nextCode = (maxRegister?.code || 0) + 1;

      const register = new CashRegister();
      register.tenantId = tenantId;
      register.branchId = branchId;
      register.code = nextCode;
      register.name = name.trim();
      register.nextInvoiceNumber = 1;
      register.isActive = true;

      const saved = await registerRepo.save(register);
      this.logger.log(`Cash register created with ID: ${saved.id}, Code: ${saved.code}`);
      return saved;
    });
  }
}
