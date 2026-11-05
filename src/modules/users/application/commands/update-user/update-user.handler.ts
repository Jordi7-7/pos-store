import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { UpdateUserCommand, UpdateUserInput } from './update-user.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';
import { AuthTokenService } from '../../../../auth/services/auth-token.service';
import { RedisService } from '../../../../../common/redis/redis.service';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isPinInUse } from '../../pin-uniqueness';
import { assertBranchesBelongToTenant } from '../../../../../common/security/tenant-ownership';
import { assertValidPermissions } from '../../../../../common/security/permissions.helper';
import { invalidateUserBranchesCache } from '../../../../../common/security/branch-access.helper';

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
    const { tenantId, userId } = command;
    this.logger.log(`Updating user: ${userId} for Tenant: ${tenantId}`);

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
    const { tenantId, userId, input } = command;

    const user = await this.loadEditableUser(manager, command);
    const wasActive = user.isActive;
    let passwordChanged = false;

    if (input.name !== undefined) {
      user.name = input.name.trim();
    }
    if (input.username !== undefined) {
      user.username = await this.cleanUsername(manager, tenantId, userId, input.username);
    }
    if (input.email !== undefined) {
      user.email = await this.cleanEmail(manager, tenantId, userId, input.email);
    }

    if (input.password !== undefined && input.password.trim()) {
      user.password = await this.hashService.hash(input.password);
      passwordChanged = true;
    }
    if (input.pin !== undefined) {
      user.pin = await this.hashedPinOrClear(manager, tenantId, userId, input.pin);
    }

    await this.applyAccess(manager, user, input);

    if (input.isActive !== undefined) {
      user.isActive = input.isActive;
    }

    const branchIds = input.branchIds;
    if (branchIds !== undefined) {
      await assertBranchesBelongToTenant(manager, tenantId, branchIds);
      // Sin ninguna sucursal asignada el usuario no puede operar: se desactiva
      if (branchIds.length === 0) {
        user.isActive = false;
      }
    }

    const saved = await manager.getRepository(User).save(user);

    if (branchIds !== undefined) {
      await this.replaceBranches(manager, saved.id, branchIds);
    }

    return {
      user: saved,
      mustRevokeSessions: passwordChanged || (wasActive && !saved.isActive),
      branchesChanged: branchIds !== undefined,
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

  private async cleanUsername(manager: EntityManager, tenantId: string, userId: string, raw: string): Promise<string> {
    const username = raw.toLowerCase().trim();
    if (!username) {
      throw new AppException(ErrorCode.UsernameRequired, 'El nombre de usuario no puede estar vacío.', HttpStatus.BAD_REQUEST);
    }
    const taken = await manager.getRepository(User).findOne({ where: { tenantId, username, id: Not(userId) } });
    if (taken) {
      throw new AppException(ErrorCode.UsernameTaken, `El nombre de usuario "${username}" ya está en uso.`, HttpStatus.CONFLICT, { username });
    }
    return username;
  }

  private async cleanEmail(manager: EntityManager, tenantId: string, userId: string, raw: string): Promise<string | null> {
    const email = raw.trim() ? raw.toLowerCase().trim() : null;
    if (email) {
      const taken = await manager.getRepository(User).findOne({ where: { tenantId, email, id: Not(userId) } });
      if (taken) {
        throw new AppException(ErrorCode.EmailTaken, `El correo "${email}" ya está en uso por otro usuario.`, HttpStatus.CONFLICT, { email });
      }
    }
    return email;
  }

  /** Hash del PIN nuevo; un PIN vacío lo elimina (`undefined`). Rechaza PINs que ya usa otro usuario. */
  private async hashedPinOrClear(manager: EntityManager, tenantId: string, userId: string, raw: string): Promise<string | undefined> {
    const pin = raw ? raw.trim() : '';
    if (!pin) {
      return undefined;
    }
    if (await isPinInUse(manager, this.hashService, tenantId, pin, userId)) {
      this.logger.warn(`PIN already in use in Tenant ${tenantId}`);
      throw new AppException(ErrorCode.PinAlreadyInUse, 'Ese PIN ya está en uso por otro usuario.', HttpStatus.CONFLICT);
    }
    return this.hashService.hash(pin);
  }

  /** Rol y permisos personalizados. El propietario no usa rol: tiene acceso total por `isOwner`. */
  private async applyAccess(manager: EntityManager, user: User, input: UpdateUserInput): Promise<void> {
    if (user.isOwner) {
      user.roleId = null;
    } else if (input.roleId !== undefined) {
      if (!input.roleId) {
        throw new AppException(ErrorCode.RoleRequired, 'Un usuario debe tener un rol asignado.', HttpStatus.BAD_REQUEST);
      }
      const roles: Array<{ id: string }> = await manager.query(
        `SELECT id FROM "roles" WHERE "id" = $1 AND "tenant_id" = $2`,
        [input.roleId, user.tenantId],
      );
      if (roles.length === 0) {
        throw new AppException(ErrorCode.RoleNotFound, 'El rol especificado no existe para esta tienda.', HttpStatus.NOT_FOUND);
      }
      user.roleId = roles[0].id;
    }

    if (input.customPermissions !== undefined) {
      user.customPermissions = assertValidPermissions(input.customPermissions);
    }
  }

  /** Reemplaza las sucursales del usuario con un único INSERT. */
  private async replaceBranches(manager: EntityManager, userId: string, branchIds: string[]): Promise<void> {
    await manager.query(`DELETE FROM "user_branches" WHERE "user_id" = $1`, [userId]);
    if (branchIds.length > 0) {
      await manager.query(
        `INSERT INTO "user_branches" ("user_id", "branch_id")
         SELECT $1::uuid, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING`,
        [userId, branchIds],
      );
    }
  }
}
