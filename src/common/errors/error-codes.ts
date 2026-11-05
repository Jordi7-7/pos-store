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

  // Autenticación
  InvalidPin = 'INVALID_PIN',
  TooManyAttempts = 'TOO_MANY_ATTEMPTS',
  PinAlreadyInUse = 'PIN_ALREADY_IN_USE',
  SessionExpired = 'SESSION_EXPIRED',

  InvalidReference = 'INVALID_REFERENCE',

  // Cajas
  CashRegisterNotAssigned = 'CASH_REGISTER_NOT_ASSIGNED',
  CashRegisterBusy = 'CASH_REGISTER_BUSY',

  // Ventas
  InvalidSaleAmounts = 'INVALID_SALE_AMOUNTS',
  InsufficientPayment = 'INSUFFICIENT_PAYMENT',
  InvalidRefund = 'INVALID_REFUND',

  // Roles
  RoleNameTaken = 'ROLE_NAME_TAKEN',
  RoleIsSystem = 'ROLE_IS_SYSTEM',
  RoleInUse = 'ROLE_IN_USE',

  // Media
  InvalidMediaUrl = 'INVALID_MEDIA_URL',
  UnsupportedMediaType = 'UNSUPPORTED_MEDIA_TYPE',
  MediaNotOwned = 'MEDIA_NOT_OWNED',
  MediaInUse = 'MEDIA_IN_USE',
}
