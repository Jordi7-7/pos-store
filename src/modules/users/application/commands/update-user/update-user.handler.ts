import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { UpdateUserCommand } from './update-user.command';
import { User } from '../../../domain/entities/user.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { HashService } from '../../../../auth/services/hash.service';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  private readonly logger = new Logger(UpdateUserHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    const { tenantId, userId, dto } = command;
    this.logger.log(`Updating user: ${userId} for Tenant: ${tenantId}`);

    const userRepo = this.entityManager.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario no encontrado.`);
    }

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }

    if (dto.email !== undefined) {
      const cleanEmail = dto.email.toLowerCase().trim();
      const emailExists = await userRepo.findOne({
        where: { tenantId, email: cleanEmail, id: Not(userId) },
      });
      if (emailExists) {
        throw new BadRequestException(`El correo "${cleanEmail}" ya está en uso por otro usuario.`);
      }
      user.email = cleanEmail;
    }

    if (dto.username !== undefined) {
      const cleanUsername = dto.username && dto.username.trim() ? dto.username.toLowerCase().trim() : null;
      if (cleanUsername) {
        const usernameExists = await userRepo.findOne({
          where: { tenantId, username: cleanUsername, id: Not(userId) },
        });
        if (usernameExists) {
          throw new BadRequestException(`El nombre de usuario "${cleanUsername}" ya está en uso.`);
        }
        user.username = cleanUsername;
      } else {
        user.username = undefined;
      }
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
        const nameUpper = roleEntity[0].name.toUpperCase();
        if (nameUpper.includes('ADMIN')) user.role = 'ADMIN';
        else if (nameUpper.includes('GERENTE') || nameUpper.includes('SUPERVISOR')) user.role = 'MANAGER';
        else if (nameUpper.includes('PROPIETARIO') || nameUpper.includes('OWNER')) user.role = 'OWNER';
        else user.role = 'CASHIER';
      } else {
        throw new BadRequestException('Un usuario debe tener un rol asignado.');
      }
    } else if (dto.role !== undefined) {
      user.role = dto.role;
      // Sync roleId if found
      const roleEntity = await this.entityManager.query(
        `SELECT id FROM "roles" WHERE "tenant_id" = $1 AND ("name" ILIKE $2 OR "name" ILIKE $3) LIMIT 1`,
        [tenantId, dto.role, dto.role === 'CASHIER' ? 'Cajero' : dto.role === 'ADMIN' ? 'Administrador' : dto.role === 'MANAGER' ? 'Gerente%' : 'Propietario'],
      );
      if (roleEntity.length > 0) {
        user.roleId = roleEntity[0].id;
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

      let finalBranchIds = dto.branchIds || [];
      if (finalBranchIds.length === 0) {
        const allBranches = await this.entityManager.find(Branch, {
          where: { tenantId, isActive: true },
          select: { id: true },
        });
        finalBranchIds = allBranches.map((b) => b.id);
      }

      if (finalBranchIds.length > 0) {
        for (const bId of finalBranchIds) {
          await this.entityManager.query(
            `INSERT INTO "user_branches" ("user_id", "branch_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [savedUser.id, bId],
          );
        }
      }
    }

    // Sync assigned cash registers if explicitly passed
    if (dto.cashRegisterIds !== undefined) {
      await this.entityManager.query(
        `DELETE FROM "user_cash_registers" WHERE "user_id" = $1`,
        [savedUser.id],
      );
      if (dto.cashRegisterIds && dto.cashRegisterIds.length > 0) {
        for (const crId of dto.cashRegisterIds) {
          await this.entityManager.query(
            `INSERT INTO "user_cash_registers" ("user_id", "cash_register_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [savedUser.id, crId],
          );
        }
      }
    }

    this.logger.log(`User ${savedUser.id} updated successfully.`);
    return savedUser;
  }
}
