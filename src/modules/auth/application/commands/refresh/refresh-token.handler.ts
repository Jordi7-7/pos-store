import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { RefreshTokenCommand } from './refresh-token.command';
import { User } from '../../../../users/domain/entities/user.entity';
import { AuthTokens, AuthTokenService } from '../../../services/auth-token.service';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  private readonly logger = new Logger(RefreshTokenHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly tokens: AuthTokenService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    const userId = await this.tokens.verifyRefreshToken(command.refreshToken);

    try {
      await this.tokens.assertIsCurrentRefreshToken(userId, command.refreshToken);
    } catch (error) {
      this.logger.warn(`Refresh failed: token mismatch or reuse detected for User ID: ${userId}. Session revoked.`);
      throw error;
    }

    // Un fallo de base de datos o de Redis aquí NO es una sesión caducada: se propaga como error del servidor
    const user = await this.entityManager.findOne(User, {
      where: { id: userId },
      relations: { roleEntity: true },
    });
    if (!user || !user.isActive) {
      this.logger.warn(`Refresh failed: User ID ${userId} not found or inactive. Session revoked.`);
      await this.tokens.revokeSession(userId);
      throw this.tokens.sessionExpired();
    }

    const session = await this.tokens.issueSession(user);
    this.logger.log(`Tokens rotated successfully for User ID: ${userId}`);
    return session;
  }
}
