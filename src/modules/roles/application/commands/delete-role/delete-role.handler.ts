import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DeleteRoleCommand } from './delete-role.command';
import { Role } from '../../../domain/entities/role.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

export interface DeleteRoleResult {
  success: true;
  message: string;
}

@CommandHandler(DeleteRoleCommand)
export class DeleteRoleHandler implements ICommandHandler<DeleteRoleCommand> {
  private readonly logger = new Logger(DeleteRoleHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: DeleteRoleCommand): Promise<DeleteRoleResult> {
    const { tenantId, id } = command;
    this.logger.log(`Deleting role ID: ${id} for Tenant: ${tenantId}`);

    // Transacción: si el rol aún tiene usuarios, no debe quedar aplicada la desasociación del propietario
    return this.entityManager.transaction(async (manager) => {
      const roleRepo = manager.getRepository(Role);
      const userRepo = manager.getRepository(User);

      const role = await roleRepo.findOne({ where: { id, tenantId } });
      if (!role) {
        this.logger.warn(`Role deletion failed: ID ${id} not found for Tenant ${tenantId}`);
        throw new AppException(ErrorCode.RoleNotFound, 'Rol no encontrado.', HttpStatus.NOT_FOUND);
      }

      if (role.isSystem) {
        this.logger.warn(`Role deletion rejected: ID ${id} is a system role`);
        throw new AppException(ErrorCode.RoleIsSystem, 'Los roles del sistema no se pueden eliminar.', HttpStatus.FORBIDDEN);
      }

      // El propietario no necesita rol: se desasocia su roleId legacy automáticamente
      await userRepo
        .createQueryBuilder()
        .update(User)
        .set({ roleId: null })
        .where('tenantId = :tenantId AND roleId = :roleId AND isOwner = true', { tenantId, roleId: role.id })
        .execute();

      const assignedUsers = await userRepo.count({ where: { tenantId, roleId: role.id } });
      if (assignedUsers > 0) {
        this.logger.warn(`Role deletion rejected: ID ${id} still has ${assignedUsers} user(s)`);
        throw new AppException(
          ErrorCode.RoleInUse,
          `No puedes eliminar este rol porque tiene ${assignedUsers} usuario(s) asignado(s). Reasigna a los usuarios primero.`,
          HttpStatus.BAD_REQUEST,
          { assignedUsers },
        );
      }

      await roleRepo.remove(role);
      this.logger.log(`Role deleted: ID ${id}`);
      return { success: true, message: 'Rol eliminado con éxito.' };
    });
  }
}
