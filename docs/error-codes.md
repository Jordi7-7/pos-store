# Catálogo de códigos de error

Generado con `python3 scripts/generate-error-catalog.py` a partir de los `AppException` y `DomainError` del código; no lo edites a mano. El front y el móvil deben decidir qué mostrar **a partir de `code`**, nunca parseando `message`.

Forma de toda respuesta de error:

```json
{ "statusCode": 409, "code": "SKU_TAKEN", "message": "...", "details": { "sku": "ABC" }, "path": "/products", "timestamp": "...", "requestId": "..." }
```

- `message` está en español y sirve como texto de respaldo, pero puede cambiar.
- `details` es opcional y trae los datos variables (ids, SKUs, cantidades) para armar el mensaje en el cliente.
- `requestId` también viaja en la cabecera `x-request-id`: pídelo al reportar un fallo.

## Códigos genéricos

| Código | HTTP | Cuándo |
|---|---|---|
| `BAD_REQUEST` | 400 | Petición mal formada sin un código más específico |
| `VALIDATION_FAILED` | 400 | Falla la validación de campos; `details` es la lista de mensajes por campo |
| `UNAUTHORIZED` | 401 | No autenticado |
| `FORBIDDEN` | 403 | Sin permiso |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `CONFLICT` | 409 | Conflicto de estado |
| `PAYLOAD_TOO_LARGE` | 413 | Cuerpo demasiado grande |
| `TOO_MANY_REQUESTS` | 429 | Límite de peticiones |
| `INTERNAL_ERROR` | 500 | Error no controlado; mensaje genérico, sin detalles internos |

## Códigos de negocio

| Código | HTTP | Módulo | Mensaje (ejemplo) | `details` |
|---|---|---|---|---|
| `ATTRIBUTE_NAME_TAKEN` | 409 | products | El atributo "{name}" ya existe. | `name` |
| `ATTRIBUTE_NOT_FOUND` | 404 | products | Atributo no encontrado. | `attributeId` |
| `ATTRIBUTE_VALUES_NOT_FOUND` | 404 | products | Uno o más valores de atributo no existen. | — |
| `ATTRIBUTE_VALUE_TAKEN` | 409 | products | El valor "{value}" ya existe para este atributo. | `value` |
| `AUTH_TOKEN_INVALID` | 401 | auth | El token de autenticación no es válido o expiró. | — |
| `AUTH_TOKEN_MISSING` | 401 | auth | Falta el token de autenticación. | — |
| `BASE_SKU_REQUIRED` | 400 | products | El SKU base es obligatorio para un producto variable. | — |
| `BASE_SKU_TAKEN` | 409 | products | El SKU base "{baseSku.trim().toUpperCase()}" ya lo usa otro producto. | `baseSku` |
| `BRANCH_ACCESS_DENIED` | 403 | common | No tienes permisos para {actionDescription} en la sucursal seleccionada. | `branchId` |
| `BRANCH_NAME_TAKEN` | 409 | branches | Ya existe otra sucursal con el nombre "{name.trim()}". | `name` |
| `BRANCH_NOT_FOUND` | 404 | branches, products, purchases, sales | La sucursal destino con ID {branchId} no existe. | `branchId` |
| `BRANCH_REQUIRED` | 400 | common | Debes seleccionar una sucursal para {actionDescription}. | — |
| `CANNOT_DEACTIVATE_SELF` | 400 | users | No puedes desactivar tu propia cuenta mientras estás en sesión. | — |
| `CASH_REGISTER_BUSY` | 409 | sales | La {register.name} ya tiene un turno abierto (por {openedByName}). Debes cerrar ese turno o seleccionar otra caja. | `cashRegisterName`, `openedBy` |
| `CASH_REGISTER_HAS_OPEN_SESSION` | 409 | sales | No puedes desactivar una caja con un turno abierto. Cierra el turno primero. | `cashRegisterId` |
| `CASH_REGISTER_INACTIVE` | 409 | sales | La {register.name} está desactivada y no se puede abrir. | `cashRegisterName` |
| `CASH_REGISTER_NOT_ASSIGNED` | 403 | sales | No tienes asignada esta caja registradora para {actionDescription}. | — |
| `CASH_REGISTER_NOT_AUTHORIZED` | 403 | sales | No tienes autorización para operar en la {register.name}. | `cashRegisterName` |
| `CASH_REGISTER_NOT_FOUND` | 404 | sales | Caja registradora no encontrada | — |
| `CASH_SESSION_NOT_FOUND` | 404 | sales | Sesión de caja no encontrada. | `id`, `sessionId` |
| `CASH_SESSION_REQUIRED` | 400 | sales | Debes tener una sesión de caja abierta para registrar una venta. | — |
| `CATEGORY_NAME_TAKEN` | 409 | products | La categoría "{name}" ya existe. | `name` |
| `CATEGORY_NOT_FOUND` | 404 | products | Categoría no encontrada. | `categoryId` |
| `CONSUMER_FINAL_PROTECTED` | 409 | customers | El CONSUMIDOR FINAL es el comprador por defecto de las ventas y no se puede eliminar. | — |
| `CUSTOMER_IDENTITY_TAKEN` | 409 | customers | Ya existe un cliente con el documento {input.identityNumber}. | `identityNumber` |
| `CUSTOMER_NOT_FOUND` | 404 | customers, sales | Cliente no encontrado. | `customerId`, `id` |
| `DEFAULT_SUPPLIER_NOT_FOUND` | 404 | purchases | No se encontró un proveedor configurado para este tenant. | — |
| `DUPLICATE_SKU_IN_IMPORT` | 400 | products | El archivo repite estos SKUs: {repeated.slice(0, 10).join(', ')} | `skus` |
| `DUPLICATE_VARIANT_COMBINATION` | 409 | products | No se permiten múltiples variantes con la misma combinación de atributos en un mismo producto. | — |
| `EMAIL_TAKEN` | 409 | auth, users | Ese correo ya está registrado en otra cuenta. | `email` |
| `EMPTY_PURCHASE` | 400 | purchases | La compra debe tener al menos un producto. | — |
| `FORBIDDEN` | 403 | auth | Solicitud de sesión web no válida. | — |
| `IDEMPOTENCY_KEY_REUSED` | 409 | sales | Ese identificador ya se usó en otra venta distinta. | — |
| `IMAGES_NOT_FOUND` | 404 | products | Una o más imágenes de la variante no existen. | — |
| `IMPORT_EMPTY` | 400 | products, purchases | No se proporcionaron registros para importar. | — |
| `IMPORT_LIMIT_EXCEEDED` | 400 | products, purchases | El archivo contiene {items.length} filas. El límite máximo permitido por importación es de 3,000 registros. | `max`, `received` |
| `INSUFFICIENT_PAYMENT` | 400 (DomainError) | sales | El monto pagado (${paid.toString()}) es menor al total de la venta (${total.toString()}). | — |
| `INSUFFICIENT_STOCK` | 409 | products, purchases | No hay stock suficiente para cancelar: la variante quedaría en negativo. | `available`, `branchId`, `requested`, `variantId` |
| `INVALID_CREDENTIALS` | 401 | auth | Tienda no encontrada o credenciales inválidas | — |
| `INVALID_MEDIA_URL` | 400 | media | message | — |
| `INVALID_PERMISSIONS` | 400 | common | Permisos no válidos: {invalid.join(', ')} | `invalid` |
| `INVALID_PIN` | 401 | auth | PIN o tienda inválidos. | — |
| `INVALID_QUANTITY` | 400 | products, purchases | La cantidad para el SKU {itemDto.sku} debe ser mayor a 0. | `sku` |
| `INVALID_REFERENCE` | 400 | common | message | — |
| `INVALID_REFUND` | 400 (DomainError) | sales | message | — |
| `INVALID_SALE_AMOUNTS` | 400 (DomainError) | sales | message | — |
| `LAST_VARIANT_CANNOT_BE_DELETED` | 409 | products | No puedes eliminar la única variante de este producto. Si deseas retirar el artículo por completo, elimina el producto principal. | — |
| `MEDIA_IN_USE` | 409 | media | No se puede eliminar la imagen porque está asignada a uno o más productos. | — |
| `MEDIA_NOT_FOUND` | 404 | media | Imagen no encontrada. | — |
| `MEDIA_NOT_OWNED` | 403 | media | El archivo no pertenece a esta tienda. | — |
| `NO_OPEN_CASH_SESSION` | 409 | sales | No hay una sesión de caja abierta en esta sucursal. | `branchId`, `cashSessionId` |
| `OFFLINE_REFERENCE_TAKEN` | 409 | sales | Ese número provisional ya se usó en otra venta. | — |
| `ONBOARDING_UNAUTHORIZED` | 401 | auth | No autorizado | — |
| `OWNER_ONLY_EDITS_SELF` | 403 | users | Solo el propietario puede modificar su propia cuenta. | — |
| `PAYLOAD_TOO_LARGE` | 413 | media | La imagen supera el tamaño máximo de {Math.round(maxBytes / 1024 / 1024)} MB. | — |
| `PERMISSION_DENIED` | 403 | auth | No tienes permisos suficientes para realizar esta acción. | — |
| `PERMISSION_ESCALATION` | 403 | common | No puedes otorgar ni administrar permisos que tú no tienes. | `missing` |
| `PIN_ALREADY_IN_USE` | 409 | users | Ese PIN ya está en uso por otro usuario. | — |
| `PRODUCT_HAS_STOCK` | 409 | products | No se puede eliminar el producto porque tiene existencias activas o saldos negativos en inventario. Todas las cantidades deben estar en 0. | — |
| `PRODUCT_NOT_FOUND` | 404 | products | Producto o variante no encontrado. | `id`, `productId` |
| `PRODUCT_NOT_SIMPLE` | 409 | products | Este producto es de tipo compuesto o tiene múltiples variantes. Debe actualizarse mediante la edición de producto compuesto o por variante individual. | — |
| `PURCHASE_BATCH_ALREADY_SOLD` | 409 | purchases | No se puede cancelar la orden de compra porque ya se vendieron {initial - remaining} unidad(es) de uno de sus lotes. | `batchId`, `consumed` |
| `PURCHASE_ORDER_ALREADY_CANCELLED` | 409 | purchases | La orden de compra ya está cancelada. | `purchaseOrderId` |
| `PURCHASE_ORDER_NOT_CANCELLABLE` | 409 | purchases | Solo se pueden cancelar órdenes de compra completadas. | — |
| `PURCHASE_ORDER_NOT_FOUND` | 404 | purchases | Orden de compra no encontrada. | `purchaseOrderId` |
| `ROLE_IN_USE` | 400 | roles | No puedes eliminar este rol porque tiene {assignedUsers} usuario(s) asignado(s). Reasigna a los usuarios primero. | `assignedUsers` |
| `ROLE_IS_SYSTEM` | 403 | roles | Los roles del sistema no se pueden modificar. | — |
| `ROLE_NAME_TAKEN` | 409 | roles | Ya existe un rol con el nombre "{name}". | — |
| `ROLE_NOT_FOUND` | 404 | roles, users | Rol no encontrado. | — |
| `ROLE_REQUIRED` | 400 | users | Un usuario debe tener un rol asignado. | — |
| `SALE_ALREADY_REFUNDED` | 409 | sales | La venta {sale.invoiceNumber \|\| saleId} ya ha sido devuelta en su totalidad. | `invoiceNumber`, `saleId` |
| `SALE_NOT_FOUND` | 404 | sales | No se encontró la venta con folio "{invoiceNumber} | `invoiceNumber`, `saleId` |
| `SERVICE_UNAVAILABLE` | HttpStatus.SERVICE_UNAVAILABLE | common | La base de datos no está disponible. | — |
| `SESSION_EXPIRED` | 401 | auth | La sesión expiró. Inicia sesión nuevamente. | — |
| `SKUS_NOT_FOUND` | 404 | purchases | Los siguientes SKUs no existen en el catálogo: {missingSkus.join(', ')} | `skus` |
| `SKU_TAKEN` | 409 | products | El SKU "{sku}" ya está registrado en otra variante. | `sku`, `skus` |
| `STOCK_RECORD_NOT_FOUND` | 404 | purchases | No existe registro de stock de la variante en la sucursal de la orden. | `branchId`, `variantId` |
| `SUPPLIER_HAS_PURCHASES` | 409 | purchases | No se puede eliminar el proveedor porque tiene órdenes de compra asociadas. | — |
| `SUPPLIER_IDENTITY_TAKEN` | 409 | purchases | Ya existe un proveedor con el documento "{input.identityNumber}". | `identityNumber` |
| `SUPPLIER_NOT_FOUND` | 404 | purchases | El proveedor seleccionado con ID {command.supplierId} no existe. | `id`, `supplierId` |
| `TENANT_NOT_FOUND` | 404 | tenants | Tienda con identificador "{query.slug}" no encontrada | `id`, `slug` |
| `TENANT_RUC_TAKEN` | 409 | auth | Ya existe una tienda registrada con el RUC {command.ruc}. | `ruc` |
| `TENANT_SLUG_INVALID` | 400 | tenants | El identificador de la tienda debe tener letras o números. | — |
| `TENANT_SLUG_REQUIRED` | 401 | auth | El identificador de la tienda es obligatorio para iniciar sesión | — |
| `TENANT_SLUG_TAKEN` | 409 | auth, tenants | Ese identificador de tienda acaba de ser tomado. Inténtalo de nuevo. | `slug` |
| `TOO_MANY_ATTEMPTS` | 429 | auth | Demasiados intentos fallidos. Inténtalo de nuevo más tarde. | — |
| `UNSUPPORTED_MEDIA_TYPE` | HttpStatus.UNSUPPORTED_MEDIA_TYPE | media | Tipo de archivo no permitido. Solo se aceptan imágenes JPEG, PNG, WebP, GIF o AVIF. | — |
| `USERNAME_INVALID` | 400 | auth | El nombre de usuario es obligatorio y debe contener caracteres válidos. | — |
| `USERNAME_REQUIRED` | 400 | users | El nombre de usuario no puede estar vacío. | — |
| `USERNAME_TAKEN` | 409 | auth, users | Ese nombre de usuario ya está en uso. | `username` |
| `USER_DISABLED` | 401 | auth | Usuario deshabilitado. Contacta a un administrador. | — |
| `USER_NOT_AUTHENTICATED` | 403 | auth, common | Usuario no autenticado o no válido para {actionDescription}. | — |
| `USER_NOT_FOUND` | 401, 404 | auth, sales, users | Usuario no encontrado | `targetUserId` |
| `USER_NOT_VALID` | 403 | common | Usuario no válido para {actionDescription}. | — |
| `VALIDATION_FAILED` | 400 | batches | Tipo de lote no válido: {unknown.join(', ')}. | `originTypes` |
| `VARIANTS_REQUIRED` | 400 | products | Un producto variable debe tener al menos una variante. | — |
| `VARIANT_HAS_STOCK` | 409 | products | No se puede eliminar la variante porque tiene existencias activas o saldos negativos en inventario. Todas las cantidades deben estar en 0. | — |
| `VARIANT_NOT_FOUND` | 404 | products, purchases, sales | Variante no encontrada. | `sku`, `variantId` |
