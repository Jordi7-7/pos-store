import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (isPublic) {
      // Si la ruta es pública pero el cliente envió un token (ej. logout), lo decodificamos opcionalmente
      if (token) {
        try {
          const jwtSecret = this.configService.get<string>('JWT_SECRET') || process.env.JWT_SECRET ;
          let payload;
          try {
            payload = await this.jwtService.verifyAsync(token, {
              secret: jwtSecret,
            });
          } catch (err: any) {
            if (err?.name === 'TokenExpiredError') {
              payload = await this.jwtService.verifyAsync(token, {
                secret: jwtSecret,
                ignoreExpiration: true,
              });
            }
          }
          if (payload) {
            request['user'] = payload;
          }
        } catch {
          // Token inválido o corrupto en ruta pública: se continúa sin bloquear
        }
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }
    try {
      const jwtSecret = this.configService.get<string>('JWT_SECRET') || process.env.JWT_SECRET ;
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtSecret,
      });
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
