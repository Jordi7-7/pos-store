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
    const { tenantId, name, email, password, role } = command;
    this.logger.log(`Creating user: ${email} with role: ${role} for Tenant: ${tenantId}`);

    const userRepo = this.entityManager.getRepository(User);

    const userExists = await userRepo.findOne({
      where: { email },
    });
    if (userExists) {
      this.logger.warn(`User creation failed: email ${email} is already in use`);
      throw new BadRequestException(`Email ${email} is already in use`);
    }

    const hashedPassword = await this.hashService.hash(password);

    const user = new User();
    user.tenantId = tenantId;
    user.name = name;
    user.email = email;
    user.password = hashedPassword;
    user.role = role;

    const savedUser = await userRepo.save(user);
    this.logger.log(`User created successfully: ${savedUser.email} (ID: ${savedUser.id})`);

    return savedUser;
  }
}
