import { Controller, Get, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Public } from '../../modules/auth/decorators/public.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/** Comprobación de vida para el balanceador y el HEALTHCHECK de Docker: la API responde y llega a la base de datos. */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly entityManager: EntityManager) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.entityManager.query('SELECT 1');
    } catch {
      throw new AppException(ErrorCode.ServiceUnavailable, 'La base de datos no está disponible.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok' };
  }
}
