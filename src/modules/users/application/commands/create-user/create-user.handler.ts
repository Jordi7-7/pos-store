import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateUserCommand } from './create-user.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';
import { assertBranchesBelongToTenant } from '../../../../../common/security/tenant-ownership';
import { assertValidPermissions } from '../../../../../common/security/permissions.helper';
import { normalizeEmail, normalizeUsername } from '../../user-fields';
import { UserRules, replaceUserBranches } from '../../user-rules';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  private readonly logger = new Logger(CreateUserHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const { tenantId, name, password, pin, roleId, customPermissions } = command;
    const username = normalizeUsername(command.username);
    const email = normalizeEmail(command.email);
    const branchIds = command.branchIds ?? [];

    this.logger.log(`Creating user: ${username} for Tenant: ${tenantId}`);

    // Todo o nada: el usuario y sus sucursales se confirman juntos
    return this.entityManager.transaction(async (manager) => {
      const rules = new UserRules(manager, this.hashService, tenantId);

      await rules.assertUsernameAvailable(username);
      await rules.assertEmailAvailable(email);
      await assertBranchesBelongToTenant(manager, tenantId, branchIds);

      const user = new User();
      user.tenantId = tenantId;
      user.name = name.trim();
      user.username = username;
      user.email = email;
      user.password = await this.hashService.hash(password);
      user.pin = await rules.hashAvailablePin(pin);
      user.isOwner = false;
      user.roleId = roleId ? await rules.requireRoleId(roleId) : await rules.defaultRoleId();
      user.customPermissions = customPermissions ? assertValidPermissions(customPermissions) : null;
      // Sin ninguna sucursal asignada el usuario no puede operar: queda inactivo
      user.isActive = branchIds.length > 0;

      const saved = await manager.getRepository(User).save(user);
      await replaceUserBranches(manager, saved.id, branchIds);

      this.logger.log(`User created successfully: ID ${saved.id}`);
      return saved;
    });
  }
}
