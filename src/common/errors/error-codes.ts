/**
 * Códigos de error estables y legibles por máquina. Front y móvil deben decidir
 * comportamiento y textos a partir de `code`, nunca parseando `message`.
 * Añadir códigos de dominio (p. ej. INSUFFICIENT_STOCK) aquí, no como texto suelto.
 */
export enum ErrorCode {
  BadRequest = 'BAD_REQUEST',
  ValidationFailed = 'VALIDATION_FAILED',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  Conflict = 'CONFLICT',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
  TooManyRequests = 'TOO_MANY_REQUESTS',
  Internal = 'INTERNAL_ERROR',
}
