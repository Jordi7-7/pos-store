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
    const { tenantId, name, email, password, role, username, pin, roleId, customPermissions } = command;
    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username ? username.toLowerCase().trim() : undefined;

    this.logger.log(`Creating user: ${cleanEmail} for Tenant: ${tenantId}`);

    const userRepo = this.entityManager.getRepository(User);

    const emailExists = await userRepo.findOne({
      where: { tenantId, email: cleanEmail },
    });
    if (emailExists) {
      this.logger.warn(`User creation failed: email ${cleanEmail} is already in use for tenant ${tenantId}`);
      throw new BadRequestException(`El correo "${cleanEmail}" ya está registrado en esta tienda.`);
    }

    if (cleanUsername) {
      const usernameExists = await userRepo.findOne({
        where: { tenantId, username: cleanUsername },
      });
      if (usernameExists) {
        this.logger.warn(`User creation failed: username ${cleanUsername} is already in use for tenant ${tenantId}`);
        throw new BadRequestException(`El nombre de usuario "${cleanUsername}" ya está registrado en esta tienda.`);
      }
    }

    // Resolve Role entity: roleId is strictly required
    let resolvedRoleId: string | null = null;
    let resolvedRoleName: string = 'CASHIER';

    if (roleId) {
      const roleEntity = await this.entityManager.query(
        `SELECT id, name FROM "roles" WHERE "id" = $1 AND "tenant_id" = $2`,
        [roleId, tenantId],
      );
      if (roleEntity.length === 0) {
        throw new BadRequestException('El rol especificado no existe para esta tienda.');
      }
      resolvedRoleId = roleEntity[0].id;
      const nameUpper = roleEntity[0].name.toUpperCase();
      if (nameUpper.includes('ADMIN')) resolvedRoleName = 'ADMIN';
      else if (nameUpper.includes('GERENTE') || nameUpper.includes('SUPERVISOR')) resolvedRoleName = 'MANAGER';
      else if (nameUpper.includes('PROPIETARIO') || nameUpper.includes('OWNER')) resolvedRoleName = 'OWNER';
      else resolvedRoleName = 'CASHIER';
    } else if (role) {
      // Backward compatibility fallback if role string was passed
      const roleEntity = await this.entityManager.query(
        `SELECT id, name FROM "roles" WHERE "tenant_id" = $1 AND ("name" ILIKE $2 OR "name" ILIKE $3) LIMIT 1`,
        [tenantId, role, role === 'CASHIER' ? 'Cajero' : role === 'ADMIN' ? 'Administrador' : role === 'MANAGER' ? 'Gerente%' : 'Propietario'],
      );
      if (roleEntity.length === 0) {
        throw new BadRequestException('No se encontró un rol predeterminado para asignar al usuario.');
      }
      resolvedRoleId = roleEntity[0].id;
      resolvedRoleName = role;
    } else {
      throw new BadRequestException('Debes seleccionar un rol para el usuario.');
    }

    const hashedPassword = await this.hashService.hash(password);

    const user = new User();
    user.tenantId = tenantId;
    user.name = name.trim();
    user.email = cleanEmail;
    user.username = cleanUsername || undefined;
    user.password = hashedPassword;
    user.role = resolvedRoleName;
    user.roleId = resolvedRoleId;
    user.customPermissions = customPermissions || null;
    user.isActive = true;

    if (pin && pin.trim()) {
      user.pin = await this.hashService.hash(pin.trim());
    } else {
      user.pin = undefined;
    }

    const savedUser = await userRepo.save(user);
    this.logger.log(`User created successfully: ${savedUser.email} (ID: ${savedUser.id})`);

    return savedUser;
  }
}
