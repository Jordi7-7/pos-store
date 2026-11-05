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
  InternalError = 'INTERNAL_ERROR',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',

  // Autenticación y sesión
  InvalidCredentials = 'INVALID_CREDENTIALS',
  UserDisabled = 'USER_DISABLED',
  InvalidPin = 'INVALID_PIN',
  TooManyAttempts = 'TOO_MANY_ATTEMPTS',
  PinAlreadyInUse = 'PIN_ALREADY_IN_USE',
  SessionExpired = 'SESSION_EXPIRED',
  AuthTokenMissing = 'AUTH_TOKEN_MISSING',
  AuthTokenInvalid = 'AUTH_TOKEN_INVALID',
  OnboardingUnauthorized = 'ONBOARDING_UNAUTHORIZED',
  TenantSlugRequired = 'TENANT_SLUG_REQUIRED',

  // Permisos y acceso
  PermissionDenied = 'PERMISSION_DENIED',
  InvalidPermissions = 'INVALID_PERMISSIONS',
  UserNotAuthenticated = 'USER_NOT_AUTHENTICATED',
  UserNotValid = 'USER_NOT_VALID',
  BranchRequired = 'BRANCH_REQUIRED',
  BranchAccessDenied = 'BRANCH_ACCESS_DENIED',

  InvalidReference = 'INVALID_REFERENCE',
  InvalidQuantity = 'INVALID_QUANTITY',

  // Tiendas
  TenantNotFound = 'TENANT_NOT_FOUND',
  TenantSlugTaken = 'TENANT_SLUG_TAKEN',
  TenantRucTaken = 'TENANT_RUC_TAKEN',

  // Usuarios y roles
  UserNotFound = 'USER_NOT_FOUND',
  UsernameRequired = 'USERNAME_REQUIRED',
  UsernameInvalid = 'USERNAME_INVALID',
  UsernameTaken = 'USERNAME_TAKEN',
  EmailTaken = 'EMAIL_TAKEN',
  RoleNotFound = 'ROLE_NOT_FOUND',
  RoleRequired = 'ROLE_REQUIRED',
  RoleNameTaken = 'ROLE_NAME_TAKEN',
  RoleIsSystem = 'ROLE_IS_SYSTEM',
  RoleInUse = 'ROLE_IN_USE',
  OwnerOnlyEditsSelf = 'OWNER_ONLY_EDITS_SELF',
  CannotDeactivateSelf = 'CANNOT_DEACTIVATE_SELF',

  // Sucursales y clientes
  BranchNotFound = 'BRANCH_NOT_FOUND',
  BranchNameTaken = 'BRANCH_NAME_TAKEN',
  CustomerNotFound = 'CUSTOMER_NOT_FOUND',
  CustomerIdentityTaken = 'CUSTOMER_IDENTITY_TAKEN',

  // Catálogo
  ProductNotFound = 'PRODUCT_NOT_FOUND',
  ProductNotSimple = 'PRODUCT_NOT_SIMPLE',
  ProductHasStock = 'PRODUCT_HAS_STOCK',
  VariantNotFound = 'VARIANT_NOT_FOUND',
  VariantHasStock = 'VARIANT_HAS_STOCK',
  LastVariantCannotBeDeleted = 'LAST_VARIANT_CANNOT_BE_DELETED',
  DuplicateVariantCombination = 'DUPLICATE_VARIANT_COMBINATION',
  VariantsRequired = 'VARIANTS_REQUIRED',
  BaseSkuRequired = 'BASE_SKU_REQUIRED',
  SkuTaken = 'SKU_TAKEN',
  DuplicateSkuInImport = 'DUPLICATE_SKU_IN_IMPORT',
  SkusNotFound = 'SKUS_NOT_FOUND',
  CategoryNotFound = 'CATEGORY_NOT_FOUND',
  CategoryNameTaken = 'CATEGORY_NAME_TAKEN',
  AttributeNotFound = 'ATTRIBUTE_NOT_FOUND',
  AttributeNameTaken = 'ATTRIBUTE_NAME_TAKEN',
  AttributeValueTaken = 'ATTRIBUTE_VALUE_TAKEN',
  AttributeValuesNotFound = 'ATTRIBUTE_VALUES_NOT_FOUND',
  ImagesNotFound = 'IMAGES_NOT_FOUND',

  // Inventario
  InsufficientStock = 'INSUFFICIENT_STOCK',
  StockRecordNotFound = 'STOCK_RECORD_NOT_FOUND',

  // Importaciones
  ImportEmpty = 'IMPORT_EMPTY',
  ImportLimitExceeded = 'IMPORT_LIMIT_EXCEEDED',

  // Compras y proveedores
  SupplierNotFound = 'SUPPLIER_NOT_FOUND',
  DefaultSupplierNotFound = 'DEFAULT_SUPPLIER_NOT_FOUND',
  SupplierIdentityTaken = 'SUPPLIER_IDENTITY_TAKEN',
  SupplierHasPurchases = 'SUPPLIER_HAS_PURCHASES',
  EmptyPurchase = 'EMPTY_PURCHASE',
  PurchaseOrderNotFound = 'PURCHASE_ORDER_NOT_FOUND',
  PurchaseOrderAlreadyCancelled = 'PURCHASE_ORDER_ALREADY_CANCELLED',
  PurchaseOrderNotCancellable = 'PURCHASE_ORDER_NOT_CANCELLABLE',
  PurchaseBatchAlreadySold = 'PURCHASE_BATCH_ALREADY_SOLD',

  // Cajas y sesiones de caja
  CashRegisterNotFound = 'CASH_REGISTER_NOT_FOUND',
  CashRegisterNotAssigned = 'CASH_REGISTER_NOT_ASSIGNED',
  CashRegisterNotAuthorized = 'CASH_REGISTER_NOT_AUTHORIZED',
  CashRegisterBusy = 'CASH_REGISTER_BUSY',
  CashSessionNotFound = 'CASH_SESSION_NOT_FOUND',
  CashSessionRequired = 'CASH_SESSION_REQUIRED',
  NoOpenCashSession = 'NO_OPEN_CASH_SESSION',

  // Ventas
  SaleNotFound = 'SALE_NOT_FOUND',
  SaleAlreadyRefunded = 'SALE_ALREADY_REFUNDED',
  InvalidSaleAmounts = 'INVALID_SALE_AMOUNTS',
  InsufficientPayment = 'INSUFFICIENT_PAYMENT',
  InvalidRefund = 'INVALID_REFUND',

  // Media
  MediaNotFound = 'MEDIA_NOT_FOUND',
  InvalidMediaUrl = 'INVALID_MEDIA_URL',
  UnsupportedMediaType = 'UNSUPPORTED_MEDIA_TYPE',
  MediaNotOwned = 'MEDIA_NOT_OWNED',
  MediaInUse = 'MEDIA_IN_USE',
}
