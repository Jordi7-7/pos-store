import type { Request } from 'express';
import { parseCorsOrigins } from './env.validation';

interface CorsDecision {
  origin: boolean;
  credentials: boolean;
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Decide por petición qué orígenes pueden llamar a la API y si pueden hacerlo **con cookies**. La sesión web
 * usa una cookie, y un origen que no sea de confianza nunca debe poder enviarla:
 * - Con `CORS_ORIGINS` (obligatorio en producción): solo esos orígenes, con credenciales.
 * - Sin ella (solo desarrollo): cualquier origen puede leer respuestas, pero únicamente `localhost` lleva credenciales.
 */
export function corsDecision(raw: string | undefined, requestOrigin: string | undefined): CorsDecision {
  const allowed = parseCorsOrigins(raw);
  if (allowed === true) {
    return { origin: true, credentials: requestOrigin !== undefined && LOCAL_ORIGIN.test(requestOrigin) };
  }
  const isAllowed = requestOrigin !== undefined && allowed.includes(requestOrigin);
  return { origin: isAllowed, credentials: isAllowed };
}

/** Delegado para `app.enableCors`. */
export function corsOptionsDelegate(raw: string | undefined) {
  return (req: Request, callback: (error: Error | null, options: CorsDecision) => void): void => {
    callback(null, corsDecision(raw, req.headers.origin));
  };
}
