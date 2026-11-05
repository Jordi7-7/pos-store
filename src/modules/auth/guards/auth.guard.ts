import { CanActivate, ExecutionContext, Injectable, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request';
import { JwtUserPayload } from '../interfaces/jwt-user-payload.interface';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (isPublic) {
      // En rutas públicas (p. ej. logout) un token enviado se lee de forma opcional, nunca bloquea
      if (token) {
        request.user = await this.readTokenLeniently(token);
      }
      return true;
    }

    if (!token) {
      throw new AppException(ErrorCode.AuthTokenMissing, 'Falta el token de autenticación.', HttpStatus.UNAUTHORIZED);
    }
    try {
      request.user = await this.jwtService.verifyAsync<JwtUserPayload>(token, { secret: this.jwtSecret() });
    } catch {
      throw new AppException(ErrorCode.AuthTokenInvalid, 'El token de autenticación no es válido o expiró.', HttpStatus.UNAUTHORIZED);
    }
    return true;
  }

  /** Firma válida aunque haya expirado (un logout con sesión vencida debe poder revocarla); inválido → undefined. */
  private async readTokenLeniently(token: string): Promise<JwtUserPayload | undefined> {
    try {
      return await this.jwtService.verifyAsync<JwtUserPayload>(token, { secret: this.jwtSecret(), ignoreExpiration: true });
    } catch {
      return undefined;
    }
  }

  private jwtSecret(): string {
    return this.configService.getOrThrow<string>('JWT_SECRET');
  }

  private extractTokenFromHeader(request: AuthenticatedRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
