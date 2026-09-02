import { Logger, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { LoginCommand } from './login.command';
import { User } from '../../../../users/domain/entities/user.entity';
import { HashService } from '../../../services/hash.service';
import { RedisService } from '../../../../../common/redis/redis.service';

import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: LoginCommand) {
    const { email: identifier, password, tenantSlug } = command;
    this.logger.log(`Login attempt for identifier: ${identifier} (tenant: ${tenantSlug || 'none'})`);

    if (!tenantSlug || !tenantSlug.trim()) {
      this.logger.warn(`Login rejected: missing tenantSlug for identifier ${identifier}`);
      throw new UnauthorizedException('El identificador de la tienda es obligatorio para iniciar sesión');
    }

    const cleanSlug = tenantSlug.toLowerCase().trim();
    const tenant = await this.entityManager.findOne(Tenant, {
      where: { slug: cleanSlug },
    });
    if (!tenant) {
      this.logger.warn(`Login failed: tenant with slug ${tenantSlug} not found`);
      throw new UnauthorizedException('Tienda no encontrada o credenciales inválidas');
    }

    const user = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.tenant', 'tenant')
      .addSelect('user.password')
      .where('user.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere('(LOWER(user.email) = LOWER(:identifier) OR LOWER(user.username) = LOWER(:identifier))', {
        identifier: identifier.trim(),
      })
      .getOne();

    if (!user) {
      this.logger.warn(`Login failed: user with identifier ${identifier} not found`);
      throw new UnauthorizedException('Invalid email/username or password');
    }

    if (user.isActive === false) {
      this.logger.warn(`Login failed: user ${user.id} (${identifier}) is deactivated`);
      throw new UnauthorizedException('Usuario deshabilitado. Contacta a un administrador.');
    }

    const isPasswordValid = await this.hashService.compare(password, user.password || '');
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: incorrect password for identifier ${identifier}`);
      throw new UnauthorizedException('Invalid email/username or password');
    }

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1d') as any,
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: this.configService.get<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN', '7d') as any,
      },
    );

    const redisKey = `refresh_token:${user.id}`;
    const ttlSeconds = 7 * 24 * 60 * 60; // 7 days
    await this.redisService.set(redisKey, refreshToken, ttlSeconds);

    this.logger.log(`Login successful for user: ${user.email} (ID: ${user.id})`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        timezone: user.tenant.timezone,
      },
    };
  }
}
