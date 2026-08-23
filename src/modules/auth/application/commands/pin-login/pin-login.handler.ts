import { Logger, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { PinLoginCommand } from './pin-login.command';
import { User } from '../../../../users/domain/entities/user.entity';
import { HashService } from '../../../services/hash.service';
import { RedisService } from '../../../../../common/redis/redis.service';

@CommandHandler(PinLoginCommand)
export class PinLoginHandler implements ICommandHandler<PinLoginCommand> {
  private readonly logger = new Logger(PinLoginHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: PinLoginCommand) {
    const { tenantId, pin } = command;
    this.logger.log(`PIN login attempt for Tenant: ${tenantId}`);

    // Find all users in this tenant with PIN enabled, selecting the pin hash
    const users = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.pin')
      .where('user.tenantId = :tenantId', { tenantId })
      .andWhere('user.pinEnabled = true')
      .getMany();

    if (!users.length) {
      throw new UnauthorizedException('No cashiers with PIN enabled found for this tenant');
    }

    // Find the user whose hashed PIN matches the provided PIN
    let matchedUser: User | null = null;
    for (const user of users) {
      if (user.pin && await this.hashService.compare(pin, user.pin)) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      this.logger.warn(`PIN login failed: incorrect PIN for Tenant ${tenantId}`);
      throw new UnauthorizedException('Invalid PIN');
    }

    const payload = {
      sub: matchedUser.id,
      tenantId: matchedUser.tenantId,
      email: matchedUser.email,
      role: matchedUser.role,
      name: matchedUser.name,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1d') as any,
    });

    const refreshToken = this.jwtService.sign(
      { sub: matchedUser.id },
      {
        secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN', '7d') as any,
      },
    );

    const redisKey = `refresh_token:${matchedUser.id}`;
    await this.redisService.set(redisKey, refreshToken, 7 * 24 * 60 * 60);

    this.logger.log(`PIN login successful: ${matchedUser.name} (ID: ${matchedUser.id})`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
        tenantId: matchedUser.tenantId,
      },
    };
  }
}
