import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateRoleCommand } from './create-role.command';
import { Role, ROLE_NAME_INDEX } from '../../../domain/entities/role.entity';
import { assertValidPermissions } from '../../../../../common/security/permissions.helper';
import { assertCanGrant, loadActorPermissions } from '../../../../../common/security/privilege-escalation';
import { AppException } from '../../../../../common/errors/app.exception';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler implements ICommandHandler<CreateRoleCommand> {
  private readonly logger = new Logger(CreateRoleHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateRoleCommand): Promise<Role> {
    const { tenantId, description, permissions } = command;
    const name = command.name.trim();
    this.logger.log(`Creating role for Tenant: ${tenantId}`);

    const roleRepo = this.entityManager.getRepository(Role);
    const granted = assertValidPermissions(permissions);
    assertCanGrant(await loadActorPermissions(this.entityManager, tenantId, command.currentUserId), granted);

    const nameTaken = () => {
      this.logger.warn(`Role creation failed: name already used in Tenant ${tenantId}`);
      return new AppException(ErrorCode.RoleNameTaken, `Ya existe un rol con el nombre "${name}".`, HttpStatus.CONFLICT);
    };
    if (await roleRepo.findOne({ where: { tenantId, name } })) throw nameTaken();

    const role = new Role();
    role.tenantId = tenantId;
    role.name = name;
    role.description = description?.trim() || null;
    role.permissions = granted;
    role.isSystem = false;

    // Dos peticiones a la vez pueden pasar la comprobación: el índice único decide y se traduce al mismo error de negocio
    const saved = await roleRepo.save(role).catch((error: unknown) => {
      throw isUniqueViolation(error, ROLE_NAME_INDEX) ? nameTaken() : error;
    });
    this.logger.log(`Role created: ID ${saved.id}`);
    return saved;
  }
}
