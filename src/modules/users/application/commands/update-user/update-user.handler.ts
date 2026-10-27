import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { UpdateUserCommand } from './update-user.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';
import { RedisService } from '../../../../../common/redis/redis.service';
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
    const { tenantId, userId, dto, currentUserId } = command;
    this.logger.log(`Updating user: ${userId} for Tenant: ${tenantId}`);

    const userRepo = this.entityManager.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario no encontrado.`);
    }

    // Seguridad: Prevenir que el usuario en sesión se auto-desactive
    if (currentUserId && currentUserId === userId && dto.isActive === false) {
      throw new BadRequestException('No puedes desactivar tu propia cuenta mientras estás en sesión.');
    }

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }

    if (dto.username !== undefined) {
      const cleanUsername = dto.username.toLowerCase().trim();
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

    if (dto.email !== undefined) {
      const cleanEmail = dto.email && dto.email.trim() ? dto.email.toLowerCase().trim() : null;
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

    if (dto.password !== undefined && dto.password.trim()) {
      user.password = await this.hashService.hash(dto.password);
    }

    if (dto.roleId !== undefined) {
      if (dto.roleId) {
        const roleEntity = await this.entityManager.query(
          `SELECT id, name FROM "roles" WHERE "id" = $1 AND "tenant_id" = $2`,
          [dto.roleId, tenantId],
        );
        if (roleEntity.length === 0) {
          throw new BadRequestException('El rol especificado no existe para esta tienda.');
        }
        user.roleId = roleEntity[0].id;
      } else {
        throw new BadRequestException('Un usuario debe tener un rol asignado.');
      }
    }

    if (dto.customPermissions !== undefined) {
      user.customPermissions = dto.customPermissions;
    }

    if (dto.pin !== undefined) {
      const trimmedPin = dto.pin ? dto.pin.trim() : '';
      if (trimmedPin) {
        user.pin = await this.hashService.hash(trimmedPin);
      } else {
        user.pin = undefined;
      }
    }

    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
    }

    const savedUser = await userRepo.save(user);

    // Sync assigned branches if explicitly passed
    if (dto.branchIds !== undefined) {
      await this.entityManager.query(
        `DELETE FROM "user_branches" WHERE "user_id" = $1`,
        [savedUser.id],
      );

      const finalBranchIds = dto.branchIds || [];
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
