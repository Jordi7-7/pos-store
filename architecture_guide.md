# Guía de arquitectura — backend POS/ERP

Cómo está construido el backend y **las reglas que el código debe seguir**. Varias reglas las hace cumplir un test (`src/architecture.spec.ts`, `src/common/security/endpoint-access.spec.ts`, `src/common/errors/error-codes.spec.ts`): si las rompes, falla el CI. Para el porqué de cada decisión, ver `docs/project-history.md`.

---

## 1. Estructura

```
src/
  main.ts, app.setup.ts        arranque y configuración HTTP común (la usan también los tests)
  app.module.ts
  config/                      variables de entorno validadas, conexión a la base de datos
  database/migrations/         migraciones TypeORM
  common/                      código compartido
    domain/                    Money, Quantity, DomainError
    errors/                    AppException, ErrorCode, filtro global, utilidades de BD
    security/                  acceso a sucursales, permisos, no-escalada de privilegios
    utils/                     paginación, LIKE seguro, parámetros SQL, zona horaria
    redis/, health/, interceptors/, enums/
  modules/<modulo>/            auth, batches, branches, customers, dashboard, media,
                               products, purchases, reports, roles, sales, tenants, users
    domain/                    entidades TypeORM, enums, reglas puras, servicios de dominio
    application/
      commands/<caso>/         *.command.ts + *.handler.ts (escrituras)
      queries/<caso>/          *.query.ts   + *.handler.ts (lecturas)
      services/                servicios de aplicación reutilizables entre handlers
    infrastructure/
      controllers/             adaptadores HTTP, sin lógica de negocio
      dtos/                    validación de la entrada (class-validator)
```

Dependencias solo hacia adentro: `infrastructure → application → domain`. `domain` no depende de `application` ni de `infrastructure`; `application` nunca importa de `infrastructure/dtos`. Lo comprueba `architecture.spec.ts`.

**Decisión consciente:** es una arquitectura de tres capas pragmática. Las entidades TypeORM viven en `domain/entities` y los handlers inyectan los repositorios de TypeORM directamente (no hay puertos ni repositorios propios como en el front). No se considera una infracción; lo que importa es que las **reglas de negocio** estén aisladas en funciones puras de `domain/` y que las capas no se crucen al revés.

---

## 2. CQRS con comandos y consultas planos

1. **DTO** (`infrastructure/dtos`): recibe el payload HTTP y lo valida con `class-validator`. El `ValidationPipe` global usa `whitelist` y `transform`.
2. **Controller**: lee el contexto del JWT (`@CurrentUser('tenantId')`, `'sub'`, `'isOwner'`), **desestructura el DTO** y construye el comando/consulta con parámetros primitivos.
3. **Command / Query** (`application`): clase **plana** de solo lectura, sin decoradores de validación. Si necesita un dato estructurado, declara su propia interfaz junto al comando (`UpdateUserInput`).
4. **Handler**: `@CommandHandler` / `@QueryHandler`. Una operación = un handler. Las escrituras corren en una **transacción**; los efectos externos (caché, revocar sesión, borrar un archivo) se hacen **después** de confirmar.

```ts
@Post()
process(@CurrentUser('tenantId') tenantId: string, @CurrentUser('sub') userId: string, @Body() dto: ProcessSaleDto) {
  return this.commandBus.execute(new ProcessSaleCommand(tenantId, userId, dto.branchId, /* … */));
}
```

### Dos niveles de profundidad
- **Núcleo** — ventas, caja, inventario, compras: reglas de negocio como **funciones puras en `domain/`** con tests unitarios (`sale-pricing.ts`, `cash-closing.ts`, `refund-plan.ts`, `stock-rules.ts`, `invoice-number.ts`…), dinero con `Money`, errores de dominio. El handler orquesta: valida, bloquea, llama a las reglas, persiste.
- **Soporte** — clientes, sucursales, proveedores, etiquetas, reportes, dashboard: CQRS simple; las lecturas pueden consultar directamente la base.

### Código legible (regla de oro)
- Un handler largo se **trocea en métodos privados con nombre** (`validateInput`, `resolveReferences`, `buildVariants`, `reserveInvoiceNumber`…); el método público cuenta la historia en pocas líneas.
- Lo que se repite entre handlers va a un **servicio** (`recordInitialStock`, `receiveStock`, `consumeStock`, `assertBaseSkuAvailable`, `translatingSkuConflict`).
- Nombres y comentarios en español, comentarios que explican el **porqué**, no el qué.
- Nada de `any` (ni `as any`) ni silenciar el lint en código nuevo. La deuda heredada solo baja: si una infracción desaparece, `pnpm lint:prune`.

### Dónde va cada cosa

| Pieza | Hace | No hace |
|---|---|---|
| **Controller** (`infrastructure/controllers`) | Valida la entrada (DTO) y despacha el command o la query | Lógica de negocio |
| **Handler** (`application/commands`, `application/queries`) | Orquesta **un** caso de uso y abre la transacción | Importar o instanciar otro handler |
| **Servicio de aplicación** (`application/services`) | Lógica con base de datos que usan **dos o más** handlers | Conocer commands, queries o DTOs |
| **Domain** (`domain/`) | Reglas puras (dinero, stock, combinaciones) con test unitario | Consultar la base o leer el entorno |

- **No se crea un servicio porque sí.** Si la lógica la usa un solo handler, se queda en él, partida en métodos privados con nombre. Si la usan dos, va a un servicio. Si es una regla sin base de datos, va a `domain`.
- Un servicio **declara su propia entrada** (`NewSimpleProduct`, `NewVariableProduct`, `NewInventoryDocument`); el handler le pasa el command, que encaja con esa forma. Quien lo reutiliza (una importación) le pasa un objeto con nombres y, si todo debe quedar en una transacción, su propio `EntityManager`.
- Un tipo que comparten un command y un servicio va a `domain` (`variant-input.ts`); una forma de respuesta compartida, a `application/read-models`.
- `architecture.spec.ts` comprueba que `application/services` no importe de `commands/` ni `queries/` y que nada en `application` importe un handler.

---

## 3. Aislamiento por tienda (tenant) — **explícito**

No hay contexto de petición ni filtrado automático.
- `tenantId` sale **siempre del JWT verificado**, nunca del cuerpo, la query ni las cabeceras.
- Todo comando/consulta que toca datos de tienda recibe `tenantId` y **cada handler filtra por él** (`where: { id, tenantId }`).
- Tablas hijas sin `tenant_id` (`product_stocks`, `sale_items`, `sale_payments`, `refund_items`, `purchase_order_items`, `cash_sessions`, `attribute_values`): se alcanzan **a través de un padre ya filtrado**.
- Los ids que llegan del cliente (sucursales, usuarios, roles, categorías, imágenes, variantes…) **se validan contra la tienda** antes de usarlos (`src/common/security/tenant-ownership.ts`).
- Un recurso de otra tienda debe comportarse como inexistente (404), no como prohibido.
- **Una consulta con un id de recurso hijo (variante, sesión…) también filtra por `tenantId`**: es el defecto más caro que se encontró (`GetProductById` por id de variante).

### Sucursales
- El **propietario** (`isOwner`) accede a todas las sucursales; el resto, **solo a las asignadas** (`user_branches`, cacheado en Redis por usuario).
- `assertUserCanAccessBranch` (consultas: sin sucursal → `BRANCH_REQUIRED`; ajena → `BRANCH_ACCESS_DENIED`), `assertUserCanOperateInBranch` (comandos) y `visibleBranchIds` (listados: se filtran a las propias sin revelar que lo ajeno existe) están en `src/common/security/branch-access.helper.ts`.
- Los listados que cruzan sucursales (devoluciones, gastos…) **deben filtrar por las sucursales visibles**.

---

## 4. Autenticación y permisos

- **Login** por tienda (`tenantSlug`) + correo o usuario + contraseña, o **PIN** para el POS. Access token JWT corto; **refresh token** firmado con `jti` único y guardado en Redis (`refresh_token:<userId>`), **rotado en cada uso**; el logout y el cambio de contraseña/desactivación **revocan la sesión**.
- **Límite de intentos** (`src/modules/auth/domain/login-throttle.ts`): 5 fallos por cuenta e IP, 20 por cuenta, 100 por IP en 15 minutos → `TOO_MANY_ATTEMPTS` (429). Un usuario inexistente gasta el mismo tiempo de hash que uno real; `USER_DISABLED` solo se revela tras acertar la contraseña.
- **Permisos:** `APP_PERMISSIONS` (`src/common/enums/permissions.enum.ts`), roles por tienda y `custom_permissions` por usuario; el propietario tiene `'*'`. Cada endpoint declara `@RequirePermissions(...)` o `@RequireAnyPermissions(...)`; `endpoint-access.spec.ts` falla si un endpoint no es explícitamente público ni declara permisos. `'*'` nunca se puede conceder.
- **No-escalada:** para crear/editar usuarios, generar PIN y crear/editar roles, quien actúa debe tener **todos** los permisos implicados (`assertCanGrant`, `PERMISSION_ESCALATION`).
- Endpoint de **onboarding** protegido con `ONBOARDING_API_KEY` (cabecera `x-onboarding-key`).

---

## 5. Errores: un contrato único

Toda respuesta de error tiene la forma `{ statusCode, code, message, details?, path, timestamp, requestId }` (`AllExceptionsFilter`, `x-request-id` en la cabecera).
- **Se lanza `AppException(ErrorCode.X, mensaje, HttpStatus, details?)`** (o `DomainError` desde el dominio). **Nunca** `BadRequestException`, `NotFoundException`… ni textos sueltos: `architecture.spec.ts` lo impide.
- El `code` es estable y descriptivo (`INSUFFICIENT_STOCK`, `SKU_TAKEN`, `CASH_SESSION_CLOSED`…); **el front y el móvil deciden qué mostrar por `code`**, no por `message`.
- Los errores no controlados responden 500 genérico sin filtrar detalles.
- **Cada código nuevo se documenta**: `python3 scripts/generate-error-catalog.py` regenera `docs/error-codes.md` (un test falla si falta alguno).
- Una violación única de la base (`23505`) **nunca debe escapar cruda**: se traduce a un error de negocio (`isUniqueViolation`, `translatingSkuConflict`).

---

## 6. Dinero, cantidades y reglas numéricas

- **Dinero con `Money`** (`src/common/domain/money.ts`): centavos exactos (BigInt), `Money.of`, `Money.ofLine(precio, cantidad)`, `.plus/.minus`, `.fraction(parte, total)`, `.allocate(pesos)`; redondeo a la mitad hacia arriba. Nada de `number` con coma flotante para sumar importes. Las cantidades usan `src/common/domain/quantity.ts`.
- **Costo:** cada venta toma su costo **FIFO** de los lotes (`product_batches`); `product_variants.purchase_price` es el costo **promedio ponderado** vigente. Cancelar una compra revalúa ese promedio con los lotes que quedan. **Solo las compras (y su cancelación) y la edición manual de la variante mueven ese promedio; los documentos de inventario (entradas, salidas, conteos y traslados) nunca lo tocan**: una entrada con costo propio crea una capa FIFO con ese costo (la valoración la respeta) pero deja el promedio como estaba, y se usa solo cuando una entrada no trae costo o una salida supera lo que hay en las capas. Decisión del dueño (2026-11-22).
- **Fuentes de cantidades del inventario:** `product_stocks.quantity` manda para «cuánto hay»; las capas FIFO (`product_batches.remaining_quantity × unit_cost`) mandan para el costo y la valoración; `inventory_movements` es historial y **nunca** se usa para calcular existencias. Los documentos (`inventory_documents`) y su contador no guardan cantidades: solo agrupan y numeran las operaciones manuales. Las tres cantidades se escriben siempre en la misma transacción mediante `lockBranchStock` / `consumeStock` / `receiveStock`; nunca se modifica `product_stocks` ni `product_batches` por otro camino. `scripts/reconcile-inventory.sql` (solo lectura) comprueba que cuadran.
- **Comentario obligatorio:** toda salida manual y todo `OTRO` exigen un comentario de al menos 4 caracteres (`isCommentRequired` / `hasValidComment`, error `COMMENT_REQUIRED`); las entradas con motivo propio, los conteos y los traslados no lo exigen. El conteo y el traslado no tienen motivo elegible: el sistema pone `CONTEO_FISICO` y `TRASLADO`.
- **Clasificación del kardex:** cada línea tiene **dirección** (`type`: IN/OUT) y **categoría** (`category`: INITIAL, PURCHASE, SALE, RETURN, ADJUSTMENT, COUNT, TRANSFER); la categoría es la única clasificación para filtrar y analizar. El **motivo** (`reason`) es detalle: solo importa en los ajustes manuales (`DONACION`, `PRODUCCION`, `MERMA`, `PERDIDA`, `USO_INTERNO`, `DEVOLUCION_PROVEEDOR`, `OTRO`) y en el resto es el código del sistema (`VENTA`, `COMPRA`…), redundante con la categoría. El **tipo del documento** (`inventory_documents.kind`: ENT, SAL, CNT, TRS) solo decide el flujo, el permiso y la numeración de las operaciones manuales; no se usa para analítica. El motivo de la cabecera se copia a cada línea y un test garantiza que coincidan.
- **El kardex se escribe en un solo sitio:** toda línea se crea con `newKardexLine` (`products/application/services/kardex.ts`), que exige categoría, costo unitario y saldo (`balance_after`, la existencia de la sucursal y variante justo tras el movimiento: lo que devuelven `consumeStock`/`receiveStock`). Nunca se hace `new InventoryMovement()` a mano ni se inserta por SQL.
- **Cadena de saldos:** las líneas con saldo de una sucursal y variante forman una cadena (el saldo anterior de cada línea es el saldo de la que la precede), y su saldo final debe ser igual a `product_stocks.quantity`. La comprobación F de `scripts/reconcile-inventory.sql` lo verifica **sin ordenar por fecha** (varias operaciones simultáneas no tienen un orden fiable por hora) y detecta tanto un stock que cambió sin dejar movimiento como una línea que falta.
- **Pagos:** de cada pago solo se guarda lo que cubre el total de la venta (`allocatePayments`); el vuelto no es ingreso.
- **Efectivo esperado en caja** = apertura + ventas en efectivo − gastos − devoluciones (`cash-closing.ts`); el cierre y el detalle del turno usan la misma regla.
- **Stock:** puede quedar negativo (se vende sin stock) y la siguiente entrada salda la deuda.
- **SKU:** `normalizeSku` (recortado y en MAYÚSCULAS) en todo punto de entrada y de búsqueda.
- **Idempotencia de ventas:** `clientRequestId` opcional; un reintento devuelve la venta original (búsqueda previa + índice único como red de seguridad).

---

## 7. Concurrencia

Reglas para no introducir carreras (detalle en `docs/database.md`): bloquear filas **siempre en el mismo orden**, transacción para todo lo que escribe más de una tabla, `FOR UPDATE`/`FOR SHARE` sobre el turno de caja, bloqueos consultivos donde no hay índice único, e **índice único + traducción del error** como red de seguridad. Cada defecto de concurrencia corregido tiene un test que lo reproduce.

---

## 8. Seguridad de entrada y salida

- `helmet`, CORS por lista (`CORS_ORIGINS`, obligatorio en producción), límite de cuerpo 10 MB, `trust proxy` configurable.
- Parámetros SQL **siempre enlazados** (`SqlParams` en SQL crudo); nunca interpolar entradas. Zona horaria validada (`resolveTimezone`).
- Búsquedas de texto con `containsPattern` (escapa `%`, `_`, `\`).
- Filtros de query con `blankToUndefined` + `@IsUUID()` (un `branchId` vacío o `"null"` = sin filtro; uno inválido = 400, no un 500 de Postgres).
- Archivos: claves de S3 por tienda (`assertBelongsToTenant`), tipos de imagen permitidos, descarga remota por URL con bloqueo de IPs internas (`safe-image-fetcher`).
- Datos sensibles: `password` y `pin` con `select: false`; **no se escribe PII (correos) en los logs**.

---

## 9. Logging

`Logger` de NestJS en cada handler de escritura: `log` al empezar y al confirmar; `warn` en los rechazos de negocio, **sin datos personales**. Los errores 5xx quedan con su `requestId`.

---

## 10. Cómo se prueba

| Qué | Dónde | Cómo |
|---|---|---|
| Reglas puras y handlers con dependencias falsas | `src/**/*.spec.ts` | `pnpm test` |
| Flujos reales sobre **Postgres y Redis** | `test/integration/*.e2e-spec.ts` | `pnpm test:integration` |
| Arquitectura y seguridad de endpoints | `src/architecture.spec.ts`, `endpoint-access.spec.ts` | dentro de `pnpm test` |

Los tests de integración **crean una base de datos propia con nombre único, aplican todas las migraciones y la borran al terminar** (`test/integration/support/integration-database.ts`: `startTestDatabase`, `seedTenant`, `seedVariant`); nunca tocan la base configurada. `http-flow.e2e-spec.ts` levanta la app completa con `configureApp` y prueba el contrato de errores por HTTP.

**Regla de calidad:** todo defecto de dinero, stock, permisos o concurrencia que se corrija **lleva un test que fallaba antes**; para las carreras, comprobar además que el test falla si se quita el bloqueo o el índice. Todo handler debe aparecer en algún test.
