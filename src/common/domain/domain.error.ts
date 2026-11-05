import { ErrorCode } from '../errors/error-codes';

/**
 * Regla de negocio incumplida. No conoce HTTP: el filtro global la traduce a la respuesta
 * de error de la API, así el dominio se puede usar y probar sin NestJS.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
