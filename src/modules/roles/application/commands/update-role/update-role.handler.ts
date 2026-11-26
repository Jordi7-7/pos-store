import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UpdateRoleCommand } from './update-role.command';
import { Role, ROLE_NAME_INDEX } from '../../../domain/entities/role.entity';
import { assertValidPermissions } from '../../../../../common/security/permissions.helper';
import { assertCanGrant, loadActorPermissions } from '../../../../../common/security/privilege-escalation';
import { AppException } from '../../../../../common/errors/app.exception';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ICommandHandler<UpdateRoleCommand> {
  private readonly logger = new Logger(UpdateRoleHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateRoleCommand): Promise<Role> {
    const { tenantId, id, description, permissions } = command;
    this.logger.log(`Updating role ID: ${id} for Tenant: ${tenantId}`);

    const roleRepo = this.entityManager.getRepository(Role);

    const role = await roleRepo.findOne({ where: { id, tenantId } });
    if (!role) {
      this.logger.warn(`Role update failed: ID ${id} not found for Tenant ${tenantId}`);
      throw new AppException(ErrorCode.RoleNotFound, 'Rol no encontrado.', HttpStatus.NOT_FOUND);
    }

    if (role.isSystem) {
      this.logger.warn(`Role update rejected: ID ${id} is a system role`);
      throw new AppException(ErrorCode.RoleIsSystem, 'Los roles del sistema no se pueden modificar.', HttpStatus.FORBIDDEN);
    }

    const name = command.name?.trim();
    const nameTaken = () => new AppException(ErrorCode.RoleNameTaken, `Ya existe otro rol con el nombre "${name}".`, HttpStatus.CONFLICT);
    if (name && name !== role.name) {
      const duplicate = await roleRepo.findOne({ where: { tenantId, name } });
      if (duplicate && duplicate.id !== role.id) throw nameTaken();
      role.name = name;
    }

    if (description !== undefined) {
      role.description = description.trim() || null;
    }

    if (permissions !== undefined) {
      const granted = assertValidPermissions(permissions);
      assertCanGrant(await loadActorPermissions(this.entityManager, tenantId, command.currentUserId), granted);
      role.permissions = granted;
    }

    // Dos peticiones a la vez pueden pasar la comprobación: el índice único decide y se traduce al mismo error de negocio
    return roleRepo.save(role).catch((error: unknown) => {
      throw isUniqueViolation(error, ROLE_NAME_INDEX) ? nameTaken() : error;
    });
  }
}
