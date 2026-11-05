import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { UpdateUserCommand, UpdateUserInput } from './update-user.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';
import { AuthTokenService } from '../../../../auth/services/auth-token.service';
import { RedisService } from '../../../../../common/redis/redis.service';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { assertBranchesBelongToTenant } from '../../../../../common/security/tenant-ownership';
import { assertValidPermissions } from '../../../../../common/security/permissions.helper';
import { invalidateUserBranchesCache } from '../../../../../common/security/branch-access.helper';
import { normalizeEmail, normalizeUsername } from '../../user-fields';
import { UserRules, replaceUserBranches } from '../../user-rules';

interface UpdateOutcome {
  user: User;
  /** Cambió la contraseña o se desactivó: las sesiones abiertas dejan de ser válidas. */
  mustRevokeSessions: boolean;
  branchesChanged: boolean;
}

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  private readonly logger = new Logger(UpdateUserHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
    private readonly redisService: RedisService,
    private readonly tokens: AuthTokenService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    this.logger.log(`Updating user: ${command.userId} for Tenant: ${command.tenantId}`);

    // Todo o nada: un fallo a mitad no puede dejar al usuario sin sucursales ni con datos a medias
    const outcome = await this.entityManager.transaction((manager) => this.applyUpdate(manager, command));

    // Efectos externos, solo tras confirmar los cambios en la base de datos
    if (outcome.branchesChanged) {
      await invalidateUserBranchesCache(this.redisService, outcome.user.id);
    }
    if (outcome.mustRevokeSessions) {
      await this.tokens.revokeSession(outcome.user.id);
    }

    this.logger.log(`User ${outcome.user.id} updated successfully.`);
    return outcome.user;
  }

  private async applyUpdate(manager: EntityManager, command: UpdateUserCommand): Promise<UpdateOutcome> {
    const { tenantId, input } = command;
    const rules = new UserRules(manager, this.hashService, tenantId);

    const user = await this.loadEditableUser(manager, command);
    const wasActive = user.isActive;

    await this.applyIdentity(user, input, rules);
    const passwordChanged = await this.applyCredentials(user, input, rules);
    await this.applyAccess(user, input, rules);
    await this.applyActivation(manager, user, input, tenantId);

    const saved = await manager.getRepository(User).save(user);
    if (input.branchIds !== undefined) {
      await replaceUserBranches(manager, saved.id, input.branchIds);
    }

    return {
      user: saved,
      mustRevokeSessions: passwordChanged || (wasActive && !saved.isActive),
      branchesChanged: input.branchIds !== undefined,
    };
  }

  private async loadEditableUser(manager: EntityManager, command: UpdateUserCommand): Promise<User> {
    const { tenantId, userId, input, currentUserId } = command;

    const user = await manager.getRepository(User).findOne({ where: { id: userId, tenantId } });
    if (!user) {
      throw new AppException(ErrorCode.UserNotFound, 'Usuario no encontrado.', HttpStatus.NOT_FOUND);
    }

    // Seguridad: la cuenta del propietario solo puede ser modificada por el propio propietario
    if (user.isOwner && currentUserId !== userId) {
      this.logger.warn(`User ${currentUserId} attempted to modify owner ${userId} in Tenant: ${tenantId}`);
      throw new AppException(ErrorCode.OwnerOnlyEditsSelf, 'Solo el propietario puede modificar su propia cuenta.', HttpStatus.FORBIDDEN);
    }

    // Seguridad: el usuario en sesión no puede desactivarse a sí mismo
    if (currentUserId && currentUserId === userId && input.isActive === false) {
      throw new AppException(ErrorCode.CannotDeactivateSelf, 'No puedes desactivar tu propia cuenta mientras estás en sesión.', HttpStatus.BAD_REQUEST);
    }
    return user;
  }

  /** Nombre, nombre de usuario y correo. */
  private async applyIdentity(user: User, input: UpdateUserInput, rules: UserRules): Promise<void> {
    if (input.name !== undefined) {
      user.name = input.name.trim();
    }
    if (input.username !== undefined) {
      const username = normalizeUsername(input.username);
      await rules.assertUsernameAvailable(username, user.id);
      user.username = username;
    }
    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      await rules.assertEmailAvailable(email, user.id);
      user.email = email;
    }
  }

  /** Contraseña y PIN. Devuelve true si cambió la contraseña. */
  private async applyCredentials(user: User, input: UpdateUserInput, rules: UserRules): Promise<boolean> {
    let passwordChanged = false;
    if (input.password !== undefined && input.password.trim()) {
      user.password = await this.hashService.hash(input.password);
      passwordChanged = true;
    }
    if (input.pin !== undefined) {
      user.pin = await rules.hashAvailablePin(input.pin, user.id);
    }
    return passwordChanged;
  }

  /** Rol y permisos personalizados. El propietario no usa rol: tiene acceso total por `isOwner`. */
  private async applyAccess(user: User, input: UpdateUserInput, rules: UserRules): Promise<void> {
    if (user.isOwner) {
      user.roleId = null;
    } else if (input.roleId !== undefined) {
      if (!input.roleId) {
        throw new AppException(ErrorCode.RoleRequired, 'Un usuario debe tener un rol asignado.', HttpStatus.BAD_REQUEST);
      }
      user.roleId = await rules.requireRoleId(input.roleId);
    }

    if (input.customPermissions !== undefined) {
      user.customPermissions = assertValidPermissions(input.customPermissions);
    }
  }

  /** Estado activo y sucursales: sin ninguna sucursal asignada el usuario no puede operar y se desactiva. */
  private async applyActivation(manager: EntityManager, user: User, input: UpdateUserInput, tenantId: string): Promise<void> {
    if (input.isActive !== undefined) {
      user.isActive = input.isActive;
    }
    if (input.branchIds !== undefined) {
      await assertBranchesBelongToTenant(manager, tenantId, input.branchIds);
      if (input.branchIds.length === 0) {
        user.isActive = false;
      }
    }
  }
}
