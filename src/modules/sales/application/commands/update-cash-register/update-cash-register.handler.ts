import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UpdateCashRegisterCommand } from './update-cash-register.command';
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { CashSessionStatus } from '../../../domain/enums/cash-session-status.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

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
      throw new AppException(ErrorCode.CashRegisterNotFound, 'Caja registradora no encontrada', HttpStatus.NOT_FOUND);
    }

    if (name !== undefined && name.trim()) {
      register.name = name.trim();
    }
    if (isActive === false && register.isActive) {
      // Una caja con turno abierto sigue recibiendo ventas: primero se cierra el turno
      const openSession = await this.entityManager.getRepository(CashSession).existsBy({ cashRegisterId: id, status: CashSessionStatus.OPEN });
      if (openSession) {
        throw new AppException(ErrorCode.CashRegisterHasOpenSession, 'No puedes desactivar una caja con un turno abierto. Cierra el turno primero.', HttpStatus.CONFLICT, { cashRegisterId: id });
      }
    }
    if (isActive !== undefined) {
      register.isActive = isActive;
    }

    const saved = await registerRepo.save(register);
    this.logger.log(`Cash register ID: ${id} updated successfully`);
    return saved;
  }
}
