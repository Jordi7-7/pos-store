import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

/** Cabecera que la web añade a sus llamadas de sesión. */
export const WEB_REQUEST_HEADER = 'x-requested-with';
export const WEB_REQUEST_VALUE = 'pos-web';

/**
 * Segunda defensa contra CSRF en los endpoints de sesión web (la primera es `SameSite=Strict` en la cookie).
 * Una cabecera propia obliga al navegador a pedir permiso CORS antes de enviarla, y un sitio ajeno no lo tiene.
 */
@Injectable()
export class WebRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers[WEB_REQUEST_HEADER] !== WEB_REQUEST_VALUE) {
      throw new AppException(ErrorCode.Forbidden, 'Solicitud de sesión web no válida.', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
