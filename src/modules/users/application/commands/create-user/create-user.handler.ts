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
    const { tenantId, name, email, password, role, username, pin } = command;
    const cleanEmail = email.toLowerCase().trim();
    const cleanUsername = username ? username.toLowerCase().trim() : undefined;

    this.logger.log(`Creating user: ${cleanEmail} with role: ${role} for Tenant: ${tenantId}`);

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

    const hashedPassword = await this.hashService.hash(password);

    const user = new User();
    user.tenantId = tenantId;
    user.name = name.trim();
    user.email = cleanEmail;
    user.username = cleanUsername || undefined;
    user.password = hashedPassword;
    user.role = role;
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
