import { Logger, HttpStatus } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { LoginCommand } from './login.command';
import { User } from '../../../../users/domain/entities/user.entity';
import { HashService } from '../../../services/hash.service';

import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { AuthTokenService } from '../../../services/auth-token.service';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
    private readonly tokens: AuthTokenService,
  ) {}

  async execute(command: LoginCommand) {
    const { email: identifier, password, tenantSlug } = command;
    this.logger.log(`Login attempt for identifier: ${identifier} (tenant: ${tenantSlug || 'none'})`);

    if (!tenantSlug || !tenantSlug.trim()) {
      this.logger.warn(`Login rejected: missing tenantSlug for identifier ${identifier}`);
      throw new AppException(ErrorCode.TenantSlugRequired, 'El identificador de la tienda es obligatorio para iniciar sesión', HttpStatus.UNAUTHORIZED);
    }

    const cleanSlug = tenantSlug.toLowerCase().trim();
    const tenant = await this.entityManager.findOne(Tenant, {
      where: { slug: cleanSlug },
    });
    if (!tenant) {
      this.logger.warn(`Login failed: tenant with slug ${tenantSlug} not found`);
      throw new AppException(ErrorCode.InvalidCredentials, 'Tienda no encontrada o credenciales inválidas', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.tenant', 'tenant')
      .leftJoinAndSelect('user.roleEntity', 'roleEntity')
      .leftJoinAndSelect('user.branches', 'branches')
      .leftJoinAndSelect('user.cashRegisters', 'cashRegisters')
      .addSelect('user.password')
      .where('user.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere('(LOWER(user.email) = LOWER(:identifier) OR LOWER(user.username) = LOWER(:identifier))', {
        identifier: identifier.trim(),
      })
      .getOne();

    if (!user) {
      this.logger.warn(`Login failed: user with identifier ${identifier} not found`);
      throw new AppException(ErrorCode.InvalidCredentials, 'Correo, usuario o contraseña incorrectos.', HttpStatus.UNAUTHORIZED);
    }

    if (user.isActive === false) {
      this.logger.warn(`Login failed: user ${user.id} (${identifier}) is deactivated`);
      throw new AppException(ErrorCode.UserDisabled, 'Usuario deshabilitado. Contacta a un administrador.', HttpStatus.UNAUTHORIZED);
    }

    const isPasswordValid = await this.hashService.compare(password, user.password || '');
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: incorrect password for identifier ${identifier}`);
      throw new AppException(ErrorCode.InvalidCredentials, 'Correo, usuario o contraseña incorrectos.', HttpStatus.UNAUTHORIZED);
    }

    const tokens = await this.tokens.issueSession(user);

    this.logger.log(`Login successful for user: ${user.email} (ID: ${user.id})`);

    return tokens;
  }
}
