import { randomInt } from 'crypto';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GeneratePinCommand } from './generate-pin.command';
import { User } from '../../../domain/entities/user.entity';
import { HashService } from '../../../../auth/services/hash.service';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isPinInUse } from '../../pin-uniqueness';

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
    const pin = await this.generateAvailablePin(tenantId, targetUserId);
    const hashedPin = await this.hashService.hash(pin);

    user.pin = hashedPin;
    await userRepo.save(user);

    this.logger.log(`PIN generated for user ${user.name} (ID: ${user.id}) in Tenant: ${tenantId}`);

    // Return plain PIN only once — never stored in plain text
    return { pin, userId: user.id };
  }

  private async generateAvailablePin(tenantId: string, userId: string): Promise<string> {
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = randomInt(100000, 1000000).toString();
      if (!(await isPinInUse(this.entityManager, this.hashService, tenantId, candidate, userId))) {
        return candidate;
      }
    }
    this.logger.warn(`Could not generate a unique PIN for Tenant ${tenantId}`);
    throw new AppException(ErrorCode.PinAlreadyInUse, 'No se pudo generar un PIN único. Inténtalo de nuevo.', HttpStatus.CONFLICT);
  }
}
