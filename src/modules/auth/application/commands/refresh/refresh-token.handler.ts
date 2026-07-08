import { Logger, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { RefreshTokenCommand } from './refresh-token.command';
import { User } from '../../../../users/domain/entities/user.entity';
import { RedisService } from '../../../../../common/redis/redis.service';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  private readonly logger = new Logger(RefreshTokenHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: RefreshTokenCommand) {
    const { refreshToken } = command;
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
      });
      const userId = payload.sub;

      const redisKey = `refresh_token:${userId}`;
      const storedToken = await this.redisService.get(redisKey);
      if (!storedToken || storedToken !== refreshToken) {
        this.logger.warn(`Refresh failed: Token mismatch or reuse detected for User ID: ${userId}. Invalidating session.`);
        await this.redisService.del(redisKey);
        throw new UnauthorizedException('Session expired or invalid refresh token');
      }

      const user = await this.entityManager.findOne(User, {
        where: { id: userId },
      });
      if (!user) {
        this.logger.warn(`Refresh failed: User ID ${userId} not found in database.`);
        throw new UnauthorizedException('User not found');
      }

      this.logger.log(`Tokens rotated successfully for User ID: ${userId}`);

      const userPayload = {
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        name: user.name,
      };

      const accessToken = this.jwtService.sign(userPayload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m') as any,
      });

      const newRefreshToken = this.jwtService.sign(
        { sub: user.id },
        {
          secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
          expiresIn: this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN', '7d') as any,
        },
      );

      const ttlSeconds = 7 * 24 * 60 * 60; // 7 days
      await this.redisService.set(redisKey, newRefreshToken, ttlSeconds);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    } catch (err: any) {
      this.logger.warn(`Refresh failed: Token signature/expiry validation error: ${err?.message}`);
      throw new UnauthorizedException('Session expired or invalid refresh token');
    }
  }
}
