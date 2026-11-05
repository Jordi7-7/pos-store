import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Excepción de aplicación con código estable. Úsala para errores de negocio
 * que el cliente deba distinguir (`throw new AppException(ErrorCode.X, 'msg', 409)`).
 * Las excepciones estándar de Nest siguen funcionando: el filtro global les asigna
 * un código según su estado HTTP.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
