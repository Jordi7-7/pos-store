import { Request } from 'express';
import { JwtUserPayload } from './jwt-user-payload.interface';

/** Petición HTTP tras pasar por AuthGuard: `user` es el contenido verificado del token. */
export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}
