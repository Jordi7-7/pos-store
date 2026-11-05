import { CanActivate, ExecutionContext, Injectable, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

@Injectable()
export class OnboardingSecretGuard implements CanActivate {
  private readonly logger = new Logger(OnboardingSecretGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedKey =
      this.configService.get<string>('ONBOARDING_API_KEY') ||
      process.env.ONBOARDING_API_KEY;

    if (!expectedKey) {
      this.logger.error(
        'ONBOARDING_API_KEY no está configurada en las variables de entorno. Petición bloqueada por seguridad.',
      );
      throw new AppException(ErrorCode.OnboardingUnauthorized, 'No autorizado', HttpStatus.UNAUTHORIZED);
    }

    const incomingKey =
      request.headers['x-onboarding-key'] || request.headers['x-api-key'];

    if (!incomingKey || incomingKey !== expectedKey) {
      this.logger.warn(
        `Intento de creación de tenant no autorizado desde IP: ${request.ip}`,
      );
      throw new AppException(ErrorCode.OnboardingUnauthorized, 'No autorizado', HttpStatus.UNAUTHORIZED);
    }

    return true;
  }
}
