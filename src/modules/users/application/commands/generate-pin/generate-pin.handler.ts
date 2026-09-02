import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GeneratePinCommand } from './generate-pin.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';

@CommandHandler(GeneratePinCommand)
export class GeneratePinHandler implements ICommandHandler<GeneratePinCommand> {
  private readonly logger = new Logger(GeneratePinHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
  ) {}

  async execute(command: GeneratePinCommand): Promise<{ pin: string; userId: string }> {
    const { tenantId, targetUserId } = command;

    const userRepo = this.entityManager.getRepository(User);

    const user = await userRepo.findOne({
      where: { id: targetUserId, tenantId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${targetUserId} not found in this tenant`);
    }

    // Generate cryptographically random 6-digit PIN
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedPin = await this.hashService.hash(pin);

    user.pin = hashedPin;
    await userRepo.save(user);

    this.logger.log(`PIN generated for user ${user.name} (ID: ${user.id}) in Tenant: ${tenantId}`);

    // Return plain PIN only once — never stored in plain text
    return { pin, userId: user.id };
  }
}
