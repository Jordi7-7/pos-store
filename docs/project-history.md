# Historia del proyecto y decisiones

Contexto de la auditoría y refactorización del monorepo, para quien retome el trabajo sin haber vivido las sesiones anteriores. Complementa a `CLAUDE.md` (reglas de trabajo), `architecture_guide.md` (arquitectura), `docs/database.md` y `docs/deployment.md`.

## 1. Qué es el producto

SaaS **POS/ERP multitenant** para tiendas (Ecuador: RUC, CONSUMIDOR FINAL, moneda USD, zona horaria `America/Guayaquil`, pero configurable por tienda). Hay **clientes reales en producción**, así que **la seguridad y no perder dinero van primero**.

Monorepo local (`/Users/jordi/dev/personal/pos-store-repo`, la raíz no es un repositorio git; cada carpeta tiene el suyo):

| Carpeta | Qué es | Estado |
|---|---|---|
| `pos-store/` | Backend NestJS 11 + CQRS + TypeORM + Postgres + Redis | **Refactor terminado** (esta historia) |
| `pos-store-front/` | Web React (Vite, TanStack Router, react-query, zustand), servida con nginx | **Pendiente** (Fase 3) |
| `pos-store-mobile/` | App Expo/React Native; ya sigue Clean Architecture por módulos | Pendiente (Fase 4) |
| `test-docker/` | `docker-compose.yml` y `Caddyfile` de despliegue (Postgres, Redis, API, frontend, Caddy) | Pendiente (Fase 5); no está en control de versiones |

## 2. Plan por fases y estado

El plan original (ya no está en el repo; esto es su resumen):

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Hotfix de seguridad del backend | ✅ |
| 1 | Red de seguridad: lint estricto, tests de caracterización, CI | ✅ |
| 2 | Backend: CQRS y DDD limpios, errores unificados, concurrencia, índices | ✅ (quedan detalles en §6) |
| 3 | **Front web: Clean Architecture completa** | ⏳ no empezada |
| 4 | **Móvil**: eliminar `any`, trocear pantallas, use-cases faltantes | ⏳ |
| 5 | **Infra**: Docker, nginx/Caddy, `test-docker` bajo control de versiones | ⏳ |

**Regla:** el backend se termina antes de tocar el front (decisión del dueño). Lo siguiente es **probar el front y el móvil contra este backend** (nunca se ha hecho) y después la Fase 3.

### Fase 3 (front web) — objetivo
Clean Architecture completa por módulo, igual que el móvil, para poder añadir **modo offline** (la fuente de datos local/remota se intercambia tras la interfaz del repositorio):
`domain/{entities,repositories,use-cases,errors}` · `infrastructure/{datasources/{remote,local},dtos,mappers,repositories,dependencies.ts}` · `presentation/{hooks,screens,components,view-models}`. Dependencias solo hacia adentro; `domain` sin React/axios/zustand.
1. **Cimientos** (`src/shared/`): `HttpClient` tipado con `ApiError` que refleje el contrato del backend (`statusCode`, `code`, `message`, `details`, `requestId`) y un **catálogo `code → mensaje de usuario`** en un solo sitio; sin `toast`/`logout` dentro del cliente (inyectar callbacks); `Money`; puertos para Excel e impresión.
2. **Offline-ready:** repositorios como interfaces; para ventas, cola de operaciones pendientes con **`clientRequestId`** (ya soportado por el backend) generado en el cliente.
3. **Funciones de dominio puras con tests:** carrito (subtotal, descuentos, topes de stock), arqueo de caja, totales de reportes.
4. Migración por módulo en este orden: `auth` → `sales`+`cash-sessions`+`cash-registers` → `products` → `purchases` → `reports` → `users`, `customers`, `branches`, `dashboard`, `media`.
5. Dividir componentes >400 líneas (`POSView`, `ProductVariableEditModal` de 1164…), eliminar ~200 `any`, validar respuestas con zod en el borde, permisos en todas las rutas (`beforeLoad`), tokens fuera de `localStorage`.

### Fase 4 (móvil)
Quitar `any`, trocear pantallas grandes con el patrón de view-model, use-cases faltantes (`useCustomers`…), `secure-storage` sin tragarse errores, mismo `ApiError` y catálogo de errores que el front (idealmente un paquete compartido).

### Fase 5 (infra)
Dockerfile con pnpm fijado, usuario no root y `HEALTHCHECK` (ya existe `GET /health`); migraciones como job único, no en el `CMD` de la API; imágenes por `sha`; nginx/Caddy con HTTPS y cabeceras; `test-docker` a git.

## 3. Decisiones tomadas (con su porqué)

Confirmadas por el dueño del proyecto durante las sesiones:

- **Tenant explícito, no implícito.** Cada comando/consulta recibe `tenantId` y cada handler filtra por él. Se eliminó el código de `AsyncLocalStorage`. *Porqué:* implícito = una consulta olvidada filtra datos de otra tienda sin que nadie lo note.
- **DTOs en `infrastructure/dtos`**; comandos y consultas son clases planas sin `class-validator`. `application/` nunca importa de `infrastructure/`.
- **Cero `any`** implícito; lint estricto como error; la deuda heredada está en `eslint-suppressions.json` y solo puede bajar.
- **Contrato único de errores** con `code` estable (≈100 códigos, `docs/error-codes.md`): el front y el móvil deciden qué mostrar **por `code`**, nunca por `message`.
- **Dos niveles de arquitectura.** *Núcleo* (ventas, caja, inventario, compras): dominio con reglas puras testeadas, `Money`, errores de dominio. *Soporte* (clientes, sucursales, proveedores, etiquetas, reportes, dashboard): CQRS simple con consultas directas.
- **Los estados son `varchar` en la base** y `enum` solo en el código (el dueño rechazó los enums de Postgres).
- **El cajero puede cambiar el precio manualmente** en una venta; cualquier cajero asignado a una caja puede usar su turno abierto.
- **Las devoluciones de ventas con tarjeta siguen restando efectivo de la caja** (decisión actual del dueño; revisar si cambia el criterio).
- **Quien no es propietario necesita sucursales asignadas explícitamente** (no hay «todas las sucursales» como bandera). El propietario (`is_owner`) lo puede todo y no tiene rol.
- **Nadie concede ni administra más permisos de los que tiene** (`PERMISSION_ESCALATION`, `src/common/security/privilege-escalation.ts`).
- **CONSUMIDOR FINAL** (`9999999999999`) es el comprador por defecto, no se puede borrar ni cambiarle el documento.
- **SKU: recortado y en MAYÚSCULAS en todo el sistema**, único por tienda; el **SKU base** del producto también es único (compartido entre simples y variables) y no puede coincidir con el SKU de una variante de otro producto (el POS busca primero por variante y la familia quedaría inalcanzable).
- **`clientRequestId` en `POST /sales`:** opcional hoy; **será obligatorio** cuando el front y el móvil lo envíen. La idempotencia es por *intento de cobro*, no por comprador.
- **TypeScript 6.0.x**, pnpm 11, Node 24.
- **Los commits los hace el asistente solo cuando se lo piden** (ver `CLAUDE.md`).

## 4. Qué se hizo y qué defectos reales aparecieron

Resultado de añadir tests de integración sobre Postgres real a cada flujo. Casi todo lo importante **no habría aparecido con tests unitarios con mocks**.

**Seguridad**
- Sin `ValidationPipe` global; PIN fijo `000000` en el onboarding; secretos por defecto; CORS abierto; sin `helmet`.
- Login sin límite de intentos, enumeración de cuentas por mensajes y por tiempo de respuesta → límite por cuenta+IP / cuenta / IP, USER_DISABLED solo tras acertar la contraseña, hash de relleno para equiparar tiempos.
- Refresh token idéntico si se emitía en el mismo segundo (la rotación no invalidaba nada) → `jti` único.
- SSRF en `upload-by-url` (descarga segura, bloqueo de IPs internas); claves de S3 ajenas.
- Interpolación de la zona horaria en SQL → validación IANA y parámetros enlazados (`SqlParams`).
- **Fuga entre tiendas:** `GetProductById` devolvía el producto de otra tienda si se pasaba el id de una de sus variantes.
- **Fuga entre sucursales** (misma tienda): venta por folio, detalle de turno, devoluciones y gastos eran visibles para usuarios de otra sucursal.
- Escalada de privilegios: un usuario con «editar usuarios» podía darse el rol de administrador, cambiar la contraseña/PIN de uno con más poder, o crear roles con cualquier permiso.
- Comodines `%`/`_` en las búsquedas coincidían con todo el catálogo.

**Dinero e inventario**
- *Deadlocks* en ventas y compras por bloquear filas de stock en orden cruzado → orden fijo por `variantId`.
- Compra vacía creaba una orden sin líneas; cancelar una compra no bloqueaba el stock antes de leer los lotes (carrera con ventas) y **no revertía el costo promedio** → ahora revalúa con los lotes que quedan.
- El vuelto se guardaba como ingreso y inflaba el efectivo esperado → el servidor aplica a cada pago solo lo que cubre el total (`allocatePayments`).
- El cierre de caja y el detalle del turno calculaban el efectivo de forma distinta → misma regla.
- Reporte de costo de ventas con decimales flotantes (`0.30000000000000004`) y reparto de descuento erróneo al devolver → `Money`. Existencias valuadas usaban compras **canceladas** y un precio de referencia → ahora valoran con los lotes que quedan (FIFO).
- Editar el SKU de un producto simple dejaba su SKU base desfasado.
- Editar un producto no era atómico (una categoría inválida dejaba SKUs ya renombrados).

**Unicidad y carreras** (cada una con migración, traducción a error de negocio y test de concurrencia): duplicados de SKU, SKU base, proveedores, clientes (un cliente borrado bloqueaba su documento), sucursales y cajas (nombre/código), etiquetas, RUC/slug/correo/usuario en el alta de tienda, una sola sesión abierta por caja. El **correo de usuario era único globalmente** por culpa de una migración autogenerada; ahora es por tienda.

**Calidad:** controllers sin lógica (todo a handlers), `AuthTokenService`, errores migrados de excepciones HTTP a `AppException` con `ErrorCode`, handlers largos troceados (`process-sale`, `create-variable-product`, `onboard-tenant`, `get-dashboard-metrics`), índices en claves foráneas y consultas calientes, `GET /health`, pipeline de CI con Postgres y Redis.

## 5. Estado medido (al cierre de esta fase)

- 431 tests unitarios y 313 de integración, todos en verde; `tsc`, lint y build limpios.
- **Los 93 handlers** aparecen en al menos un test.
- Supresiones de lint: **538 → 131** (38 archivos).
- Rama `refactor`, ~190 commits **sin push**.
- Aplicado y verificado contra Postgres 16 + Redis 7 limpios (CI) y contra la base local de desarrollo.

## 6. Pendiente y límites conocidos

**Backend**
- 131 supresiones de lint heredadas (la mayoría `no-unsafe-return`/`no-unsafe-member-access`); sobre todo `sales.controller`, `purchases.controller`, `redis.service`, `branch-access.helper`, `logging.interceptor`, `close-cash-session`.
- `GetPosVariants` (catálogo para el POS) devuelve **todo** el catálogo sin paginar a propósito; pesará con decenas de miles de variantes.
- `GetCashRegisters` (listado administrativo) no filtra por sucursal para quien no es propietario.
- El cálculo del costo promedio en una compra usa el stock total de todas las sucursales.
- El Administrador por defecto recibe casi todos los permisos (el filtro de exclusión compara por *nombre* de clave y los alias comparten valor); está fijado en un test, es una decisión pendiente del dueño.
- Los barcodes no se normalizan ni se comprueba que no choquen con un SKU base.
- `clientRequestId` aún es opcional; los clientes actuales no lo envían, así que **la protección contra ventas duplicadas todavía no actúa en producción**.

**Despliegue** (ver `docs/deployment.md`): rotar los secretos (recomendado; ninguno está en git), comprobaciones de duplicados antes de migrar, migraciones como paso aparte, backup obligatorio.

**Verificación que nunca se ha hecho:** ejecutar el front web y el móvil contra este backend (cambios de código de error y de estado HTTP, errores 429/403/409, SKU en mayúsculas, formas de respuesta). También staging con datos reales.

## 7. Datos de la base de desarrollo local (al cierre)

3 usuarios con PIN `000000` (el valor antiguo del onboarding): hay que regenerarlos. Las 4 comprobaciones de duplicados de `docs/deployment.md` §3 dieron 0 filas, así que las migraciones pendientes se aplican limpias en local.
