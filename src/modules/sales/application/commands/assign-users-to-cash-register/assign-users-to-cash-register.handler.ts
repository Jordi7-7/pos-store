import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AssignUsersToCashRegisterCommand } from './assign-users-to-cash-register.command';
import { CashRegister } from '../../../domain/entities/cash-register.entity';

@CommandHandler(AssignUsersToCashRegisterCommand)
export class AssignUsersToCashRegisterHandler implements ICommandHandler<AssignUsersToCashRegisterCommand> {
  private readonly logger = new Logger(AssignUsersToCashRegisterHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: AssignUsersToCashRegisterCommand): Promise<{ success: boolean; message: string }> {
    const { tenantId, id, userIds } = command;
    this.logger.log(`Assigning users [${userIds?.join(', ')}] to cash register ID: ${id} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const registerRepo = transactionalManager.getRepository(CashRegister);
      const register = await registerRepo.findOne({
        where: { id, tenantId },
      });

      if (!register) {
        throw new NotFoundException('Caja registradora no encontrada');
      }

      // Eliminar asignaciones anteriores
      await transactionalManager.query(
        `DELETE FROM "user_cash_registers" WHERE "cash_register_id" = $1`,
        [register.id],
      );

      // Insertar nuevas asignaciones
      if (userIds && userIds.length > 0) {
        for (const uId of userIds) {
          await transactionalManager.query(
            `INSERT INTO "user_cash_registers" ("user_id", "cash_register_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [uId, register.id],
          );
        }
      }

      this.logger.log(`Users successfully assigned to cash register ID: ${id}`);
      return { success: true, message: 'Usuarios asignados exitosamente a la caja' };
    });
  }
}
