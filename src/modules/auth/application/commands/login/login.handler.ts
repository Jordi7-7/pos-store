import { Logger, HttpStatus } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { LoginCommand } from './login.command';
import { User } from '../../../../users/domain/entities/user.entity';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { HashService } from '../../../services/hash.service';
import { AuthTokenService, AuthTokens } from '../../../services/auth-token.service';
import { AttemptPolicy, LoginAttemptsService } from '../../../services/login-attempts.service';
import { accountThrottles, ipThrottle } from '../../../domain/login-throttle';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
    private readonly tokens: AuthTokenService,
    private readonly loginAttempts: LoginAttemptsService,
  ) {}

  async execute(command: LoginCommand): Promise<AuthTokens> {
    const { email: identifier, password, tenantSlug, clientIp } = command;

    if (!tenantSlug || !tenantSlug.trim()) {
      throw new AppException(ErrorCode.TenantSlugRequired, 'El identificador de la tienda es obligatorio para iniciar sesión', HttpStatus.UNAUTHORIZED);
    }

    // Antes de tocar la base de datos: una IP bloqueada no puede seguir sondeando tiendas ni usuarios
    const fromIp = ipThrottle(clientIp);
    await this.assertNotLocked(fromIp);

    const tenant = await this.entityManager.findOne(Tenant, { where: { slug: tenantSlug.toLowerCase().trim() } });
    if (!tenant) {
      await this.loginAttempts.registerFailure(fromIp);
      this.logger.warn(`Login failed: unknown tenant slug (ip: ${clientIp})`);
      throw new AppException(ErrorCode.InvalidCredentials, 'Tienda no encontrada o credenciales inválidas', HttpStatus.UNAUTHORIZED);
    }

    const { perAccountFromIp, perAccount } = accountThrottles(tenant.id, identifier, clientIp);
    await this.assertNotLocked(perAccountFromIp, perAccount);

    const user = await this.findUser(tenant.id, identifier);

    // Con o sin usuario se hace una comparación de hash: el tiempo de respuesta no revela qué cuentas existen
    const passwordMatches = user
      ? await this.hashService.compare(password, user.password || '')
      : await this.hashService.compareAgainstPlaceholder(password);

    if (!user || !passwordMatches) {
      await Promise.all([perAccountFromIp, perAccount, fromIp].map((policy) => this.loginAttempts.registerFailure(policy)));
      this.logger.warn(`Login failed: invalid credentials for Tenant ${tenant.id} (ip: ${clientIp})`);
      throw new AppException(ErrorCode.InvalidCredentials, 'Correo, usuario o contraseña incorrectos.', HttpStatus.UNAUTHORIZED);
    }

    // Solo quien demuestra la contraseña llega a saber que la cuenta está deshabilitada
    if (user.isActive === false) {
      this.logger.warn(`Login rejected: user ${user.id} is deactivated`);
      throw new AppException(ErrorCode.UserDisabled, 'Usuario deshabilitado. Contacta a un administrador.', HttpStatus.UNAUTHORIZED);
    }

    await this.loginAttempts.reset(perAccountFromIp.key);
    const session = await this.tokens.issueSession(user);
    this.logger.log(`Login successful for user ID: ${user.id}`);
    return session;
  }

  private findUser(tenantId: string, identifier: string): Promise<User | null> {
    return this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleEntity', 'roleEntity')
      .addSelect('user.password')
      .where('user.tenantId = :tenantId', { tenantId })
      .andWhere('(LOWER(user.email) = LOWER(:identifier) OR LOWER(user.username) = LOWER(:identifier))', {
        identifier: identifier.trim(),
      })
      .getOne();
  }

  private async assertNotLocked(...policies: AttemptPolicy[]): Promise<void> {
    for (const policy of policies) {
      if (await this.loginAttempts.isLocked(policy)) {
        this.logger.warn(`Login blocked (too many attempts) for key ${policy.key.split(':')[0]}`);
        throw new AppException(ErrorCode.TooManyAttempts, 'Demasiados intentos fallidos. Inténtalo de nuevo más tarde.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }
}
