import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { UpdateUserCommand } from './update-user.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';
import { RedisService } from '../../../../../common/redis/redis.service';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isPinInUse } from '../../pin-uniqueness';
import { assertBranchesBelongToTenant } from '../../../../../common/security/tenant-ownership';
import { assertValidPermissions } from '../../../../../common/security/permissions.helper';
import { invalidateUserBranchesCache } from '../../../../../common/security/branch-access.helper';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  private readonly logger = new Logger(UpdateUserHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    const { tenantId, userId, input, currentUserId } = command;
    this.logger.log(`Updating user: ${userId} for Tenant: ${tenantId}`);

    const userRepo = this.entityManager.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario no encontrado.`);
    }

    // Seguridad: la cuenta del propietario solo puede ser modificada por el propio propietario
    if (user.isOwner && currentUserId !== userId) {
      this.logger.warn(`User ${currentUserId} attempted to modify owner ${userId} in Tenant: ${tenantId}`);
      throw new ForbiddenException('Solo el propietario puede modificar su propia cuenta.');
    }

    // Seguridad: Prevenir que el usuario en sesión se auto-desactive
    if (currentUserId && currentUserId === userId && input.isActive === false) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta mientras estás en sesión.');
    }

    if (input.name !== undefined) {
      user.name = input.name.trim();
    }

    if (input.username !== undefined) {
      const cleanUsername = input.username.toLowerCase().trim();
      if (!cleanUsername) {
        throw new BadRequestException('El nombre de usuario no puede estar vacío.');
      }
      const usernameExists = await userRepo.findOne({
        where: { tenantId, username: cleanUsername, id: Not(userId) },
      });
      if (usernameExists) {
        throw new BadRequestException(`El nombre de usuario "${cleanUsername}" ya está en uso.`);
      }
      user.username = cleanUsername;
    }

    if (input.email !== undefined) {
      const cleanEmail = input.email && input.email.trim() ? input.email.toLowerCase().trim() : null;
      if (cleanEmail) {
        const emailExists = await userRepo.findOne({
          where: { tenantId, email: cleanEmail, id: Not(userId) },
        });
        if (emailExists) {
          throw new BadRequestException(`El correo "${cleanEmail}" ya está en uso por otro usuario.`);
        }
      }
      user.email = cleanEmail;
    }

    if (input.password !== undefined && input.password.trim()) {
      user.password = await this.hashService.hash(input.password);
    }

    if (user.isOwner) {
      // El Propietario tiene acceso absoluto por is_owner: true y no requiere roleId
      user.roleId = null;
    } else if (input.roleId !== undefined) {
      if (input.roleId) {
        const roleEntity = await this.entityManager.query(
          `SELECT id, name FROM "roles" WHERE "id" = $1 AND "tenant_id" = $2`,
          [input.roleId, tenantId],
        );
        if (roleEntity.length === 0) {
          throw new BadRequestException('El rol especificado no existe para esta tienda.');
        }
        user.roleId = roleEntity[0].id;
      } else {
        throw new BadRequestException('Un usuario debe tener un rol asignado.');
      }
    }

    if (input.branchIds !== undefined) {
      await assertBranchesBelongToTenant(this.entityManager, tenantId, input.branchIds || []);
    }

    if (input.customPermissions !== undefined) {
      user.customPermissions = assertValidPermissions(input.customPermissions);
    }

    if (input.pin !== undefined) {
      const trimmedPin = input.pin ? input.pin.trim() : '';
      if (trimmedPin) {
        if (await isPinInUse(this.entityManager, this.hashService, tenantId, trimmedPin, userId)) {
          this.logger.warn(`PIN already in use in Tenant ${tenantId}`);
          throw new AppException(ErrorCode.PinAlreadyInUse, 'Ese PIN ya está en uso por otro usuario.', HttpStatus.CONFLICT);
        }
        user.pin = await this.hashService.hash(trimmedPin);
      } else {
        user.pin = undefined;
      }
    }

    if (input.isActive !== undefined) {
      user.isActive = input.isActive;
    }

    const savedUser = await userRepo.save(user);

    // Sync assigned branches if explicitly passed
    if (input.branchIds !== undefined) {
      await this.entityManager.query(
        `DELETE FROM "user_branches" WHERE "user_id" = $1`,
        [savedUser.id],
      );

      const finalBranchIds = input.branchIds || [];
      if (finalBranchIds.length === 0) {
        // As requested: if all branches are deselected, inactivate the user
        savedUser.isActive = false;
        await userRepo.save(savedUser);
      } else {
        for (const bId of finalBranchIds) {
          await this.entityManager.query(
            `INSERT INTO "user_branches" ("user_id", "branch_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [savedUser.id, bId],
          );
        }
      }

      // Invalidate Redis Cache-Aside for user branches immediately
      await invalidateUserBranchesCache(this.redisService, savedUser.id);
    }

    this.logger.log(`User ${savedUser.id} updated successfully.`);
    return savedUser;
  }
}
