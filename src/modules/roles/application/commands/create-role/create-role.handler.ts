import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateRoleCommand } from './create-role.command';
import { Role } from '../../../domain/entities/role.entity';
import { assertValidPermissions } from '../../../../../common/security/permissions.helper';
import { assertCanGrant, loadActorPermissions } from '../../../../../common/security/privilege-escalation';
import { AppException } from '../../../../../common/errors/app.exception';
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

    const existing = await roleRepo.findOne({ where: { tenantId, name } });
    if (existing) {
      this.logger.warn(`Role creation failed: name already used in Tenant ${tenantId}`);
      throw new AppException(ErrorCode.RoleNameTaken, `Ya existe un rol con el nombre "${name}".`, HttpStatus.CONFLICT);
    }

    const role = new Role();
    role.tenantId = tenantId;
    role.name = name;
    role.description = description?.trim() || null;
    role.permissions = granted;
    role.isSystem = false;

    const saved = await roleRepo.save(role);
    this.logger.log(`Role created: ID ${saved.id}`);
    return saved;
  }
}
