import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { RedisService } from '../../../common/redis/redis.service';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { resolveEffectivePermissions, PermissionSubject } from '../domain/effective-permissions';
import { JwtUserPayload } from '../interfaces/jwt-user-payload.interface';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Datos del usuario que viajan en el token de acceso. */
export interface TokenSubject extends PermissionSubject {
  id: string;
  tenantId: string;
  name: string;
  username?: string | null;
  email?: string | null;
  roleId?: string | null;
  roleEntity?: { name: string; permissions?: string[] | null } | null;
}

const DEFAULT_ACCESS_TTL = '15m';
const DEFAULT_REFRESH_TTL = '7d';

const refreshKey = (userId: string): string => `refresh_token:${userId}`;

/**
 * Emite, verifica y revoca las sesiones. Login, login por PIN y refresh comparten el mismo
 * contenido del token y la misma política de refresh (un solo token vigente por usuario).
 */
@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /** Firma un par de tokens nuevo y deja el refresh como el único válido del usuario. */
  async issueSession(user: TokenSubject): Promise<AuthTokens> {
    const accessToken = this.jwtService.sign(this.accessPayload(user), {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.ttl('JWT_EXPIRES_IN', DEFAULT_ACCESS_TTL),
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: this.configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
        expiresIn: this.ttl('REFRESH_TOKEN_EXPIRES_IN', DEFAULT_REFRESH_TTL),
      },
    );

    await this.redisService.set(refreshKey(user.id), refreshToken, this.secondsUntilExpiry(refreshToken));
    return { accessToken, refreshToken };
  }

  /** Id del usuario de un refresh token con firma válida y vigente; si no, SESSION_EXPIRED. */
  async verifyRefreshToken(refreshToken: string): Promise<string> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('REFRESH_TOKEN_SECRET'),
      });
      return payload.sub;
    } catch {
      throw this.sessionExpired();
    }
  }

  /** Solo el último refresh token emitido es válido: uno distinto indica reutilización y revoca la sesión. */
  async assertIsCurrentRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const stored = await this.redisService.get(refreshKey(userId));
    if (!stored || stored !== refreshToken) {
      await this.revokeSession(userId);
      throw this.sessionExpired();
    }
  }

  async revokeSession(userId: string): Promise<void> {
    await this.redisService.del(refreshKey(userId));
  }

  sessionExpired(): AppException {
    return new AppException(ErrorCode.SessionExpired, 'La sesión expiró. Inicia sesión nuevamente.', HttpStatus.UNAUTHORIZED);
  }

  private accessPayload(user: TokenSubject): Omit<JwtUserPayload, 'iat' | 'exp'> {
    return {
      sub: user.id,
      tenantId: user.tenantId,
      username: user.username,
      email: user.email,
      isOwner: user.isOwner,
      role: user.isOwner ? 'OWNER' : user.roleEntity?.name || 'USER',
      roleId: user.roleId || null,
      roleName: user.isOwner ? 'Propietario' : user.roleEntity?.name || 'Usuario',
      permissions: resolveEffectivePermissions(user),
      name: user.name,
    };
  }

  private ttl(key: string, fallback: string): JwtSignOptions['expiresIn'] {
    return this.configService.get<string>(key, fallback) as JwtSignOptions['expiresIn'];
  }

  /** El Redis expira junto con el token, sea cual sea el TTL configurado. */
  private secondsUntilExpiry(token: string): number {
    const decoded = this.jwtService.decode<{ exp?: number } | null>(token);
    const seconds = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 0;
    return seconds > 0 ? seconds : 7 * 24 * 60 * 60;
  }
}
