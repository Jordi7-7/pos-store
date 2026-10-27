import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CreateUserCommand } from './create-user.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  private readonly logger = new Logger(CreateUserHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const { tenantId, name, username, password, email, pin, roleId, customPermissions, branchIds } = command;
    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email && email.trim() ? email.toLowerCase().trim() : null;

    this.logger.log(`Creating user: ${cleanUsername} for Tenant: ${tenantId}`);

    const userRepo = this.entityManager.getRepository(User);

    // 1. Username is mandatory and must be unique per tenant
    const usernameExists = await userRepo.findOne({
      where: { tenantId, username: cleanUsername },
    });
    if (usernameExists) {
      this.logger.warn(`User creation failed: username ${cleanUsername} is already in use for tenant ${tenantId}`);
      throw new BadRequestException(`El nombre de usuario "${cleanUsername}" ya está registrado en esta tienda.`);
    }

    // 2. Email is optional; if provided, must be unique per tenant
    if (cleanEmail) {
      const emailExists = await userRepo.findOne({
        where: { tenantId, email: cleanEmail },
      });
      if (emailExists) {
        this.logger.warn(`User creation failed: email ${cleanEmail} is already in use for tenant ${tenantId}`);
        throw new BadRequestException(`El correo "${cleanEmail}" ya está registrado en esta tienda.`);
      }
    }

    // Resolve Role entity: roleId is strictly used
    let resolvedRoleId: string | null = null;

    if (roleId) {
      const roleEntity = await this.entityManager.query(
        `SELECT id, name FROM "roles" WHERE "id" = $1 AND "tenant_id" = $2`,
        [roleId, tenantId],
      );
      if (roleEntity.length === 0) {
        throw new BadRequestException('El rol especificado no existe para esta tienda.');
      }
      resolvedRoleId = roleEntity[0].id;
    } else {
      // Default to first system role (e.g. Cajero) if none provided
      const defaultRole = await this.entityManager.query(
        `SELECT id, name FROM "roles" WHERE "tenant_id" = $1 AND "name" ILIKE '%Cajero%' LIMIT 1`,
        [tenantId],
      );
      if (defaultRole.length > 0) {
        resolvedRoleId = defaultRole[0].id;
      }
    }

    const hashedPassword = await this.hashService.hash(password);

    const user = new User();
    user.tenantId = tenantId;
    user.name = name.trim();
    user.username = cleanUsername;
    user.email = cleanEmail;
    user.password = hashedPassword;
    user.isOwner = false;
    user.roleId = resolvedRoleId;
    user.customPermissions = customPermissions || null;
    user.isActive = true;

    if (pin && pin.trim()) {
      user.pin = await this.hashService.hash(pin.trim());
    } else {
      user.pin = undefined;
    }

    // Save assigned branches (if none provided, user is inactive)
    const finalBranchIds = branchIds || [];

    if (finalBranchIds.length === 0) {
      user.isActive = false;
    }

    const savedUser = await userRepo.save(user);

    if (finalBranchIds.length > 0) {
      for (const bId of finalBranchIds) {
        await this.entityManager.query(
          `INSERT INTO "user_branches" ("user_id", "branch_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [savedUser.id, bId],
        );
      }
    }

    this.logger.log(`User created successfully: ${savedUser.email} (ID: ${savedUser.id})`);

    return savedUser;
  }
}
