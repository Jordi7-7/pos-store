import { HttpStatus, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { PinLoginCommand } from './pin-login.command';
import { User } from '../../../../users/domain/entities/user.entity';
import { HashService } from '../../../services/hash.service';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { AttemptPolicy, LoginAttemptsService } from '../../../services/login-attempts.service';

import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { AuthTokenService } from '../../../services/auth-token.service';

@CommandHandler(PinLoginCommand)
export class PinLoginHandler implements ICommandHandler<PinLoginCommand> {
  private readonly logger = new Logger(PinLoginHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
    private readonly tokens: AuthTokenService,
    private readonly loginAttempts: LoginAttemptsService,
  ) {}

  async execute(command: PinLoginCommand) {
    const { tenantSlug, pin, clientIp } = command;

    const cleanSlug = tenantSlug.toLowerCase().trim();
    const tenant = await this.entityManager.findOne(Tenant, {
      where: { slug: cleanSlug },
    });
    if (!tenant) {
      this.logger.warn(`PIN login failed: tenant with slug ${cleanSlug} not found (ip: ${clientIp})`);
      throw this.invalidPin();
    }

    const perIp = this.ipPolicy(tenant.id, clientIp);
    const perTenant = this.tenantPolicy(tenant.id);
    if ((await this.loginAttempts.isLocked(perIp)) || (await this.loginAttempts.isLocked(perTenant))) {
      this.logger.warn(`PIN login blocked (too many attempts) for Tenant ${tenant.id} from ip ${clientIp}`);
      throw new AppException(
        ErrorCode.TooManyAttempts,
        'Demasiados intentos fallidos. Inténtalo de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.logger.log(`PIN login attempt for Tenant: ${tenant.id} (@${tenant.slug})`);

    // Find all users in this tenant with PIN enabled, selecting the pin hash
    const users = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.tenant', 'tenant')
      .leftJoinAndSelect('user.roleEntity', 'roleEntity')
      .leftJoinAndSelect('user.branches', 'branches')
      .leftJoinAndSelect('user.cashRegisters', 'cashRegisters')
      .addSelect('user.pin')
      .where('user.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere('user.isActive = true')
      .andWhere('user.pin IS NOT NULL')
      .getMany();

    // Find the user whose hashed PIN matches the provided PIN
    let matchedUser: User | null = null;
    for (const user of users) {
      if (user.pin && (await this.hashService.compare(pin, user.pin))) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      await this.loginAttempts.registerFailure(perIp);
      await this.loginAttempts.registerFailure(perTenant);
      this.logger.warn(`PIN login failed: incorrect PIN for Tenant ${tenant.id} (@${tenant.slug}) from ip ${clientIp}`);
      // Misma respuesta que "tienda inexistente" o "sin PINs": no revela qué falló.
      throw this.invalidPin();
    }

    await this.loginAttempts.reset(perIp.key);

    const tokens = await this.tokens.issueSession(matchedUser);

    this.logger.log(`PIN login successful: ${matchedUser.name} (ID: ${matchedUser.id})`);

    return tokens;
  }

  private invalidPin(): AppException {
    return new AppException(ErrorCode.InvalidPin, 'PIN o tienda inválidos.', HttpStatus.UNAUTHORIZED);
  }

  private ipPolicy(tenantId: string, clientIp: string): AttemptPolicy {
    return { key: `pin_attempts:${tenantId}:${clientIp}`, maxAttempts: 5, windowSeconds: 15 * 60 };
  }

  private tenantPolicy(tenantId: string): AttemptPolicy {
    return { key: `pin_attempts:${tenantId}`, maxAttempts: 50, windowSeconds: 15 * 60 };
  }
}
