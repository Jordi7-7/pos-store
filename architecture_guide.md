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
- Nada de `any` (ni `as any`), ni silenciar el lint. Si una infracción heredada desaparece, `pnpm lint:prune`.

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
- **Costo:** cada venta toma su costo **FIFO** de los lotes (`product_batches`); `product_variants.purchase_price` es el costo **promedio ponderado** vigente. Cancelar una compra revalúa ese promedio con los lotes que quedan.
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
