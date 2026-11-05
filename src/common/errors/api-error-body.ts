import { ErrorCode } from './error-codes';

/**
 * Contrato único de error HTTP del backend. `statusCode` y `message` se mantienen
 * como en Nest para no romper a los clientes existentes; el resto es aditivo.
 */
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
  requestId: string;
}
