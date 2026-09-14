import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UpdateCashRegisterCommand } from './update-cash-register.command';
import { CashRegister } from '../../../domain/entities/cash-register.entity';

@CommandHandler(UpdateCashRegisterCommand)
export class UpdateCashRegisterHandler implements ICommandHandler<UpdateCashRegisterCommand> {
  private readonly logger = new Logger(UpdateCashRegisterHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateCashRegisterCommand): Promise<CashRegister> {
    const { tenantId, id, name, isActive } = command;
    this.logger.log(`Updating cash register ID: ${id} for Tenant: ${tenantId}`);

    const registerRepo = this.entityManager.getRepository(CashRegister);
    const register = await registerRepo.findOne({
      where: { id, tenantId },
    });

    if (!register) {
      throw new NotFoundException('Caja registradora no encontrada');
    }

    if (name !== undefined && name.trim()) {
      register.name = name.trim();
    }
    if (isActive !== undefined) {
      register.isActive = isActive;
    }

    const saved = await registerRepo.save(register);
    this.logger.log(`Cash register ID: ${id} updated successfully`);
    return saved;
  }
}
