# CLAUDE.md — backend `pos-store`

Contexto y reglas para cualquier sesión de trabajo en este repositorio. **Léelo entero antes de cambiar código.** Detalle: `architecture_guide.md` (arquitectura), `docs/database.md`, `docs/deployment.md`, `docs/error-codes.md`, `docs/project-history.md` (historia, decisiones y pendiente).

## Quién y cómo
- El dueño del proyecto habla **español**: responde en español. Comentarios y mensajes de usuario en español; **mensajes de commit en inglés** (convencionales: `feat(scope):`, `fix(scope):`, `refactor:`, `test:`, `docs:`).
- Es un SaaS POS/ERP con **clientes reales en producción**: seguridad y dinero primero. Ante la duda entre rápido y correcto, correcto.
- Sé honesto con el estado: si algo no se pudo verificar, dilo; no declares «funciona» sin evidencia (test, ejecución real). Distingue lo probado de lo supuesto.

## Reglas de trabajo acordadas con el dueño (no negociables)
1. **NO hagas `git commit` salvo que te lo pida explícitamente** («haz el commit», «comitea»). Deja los cambios sin commitear y pregunta. Agrupa los commits por tema con nombres descriptivos. **No hagas `git push`** salvo petición expresa.
2. **Los secretos viven solo en el `.env` real (ignorado por git) y en el entorno de producción.** `.env.example` es una **plantilla con marcadores `<…>`**, sin valores reales, y sí se versiona; el arranque rechaza esos marcadores sin rellenar. Nunca imprimas valores de ningún `.env`, nunca los pegues en docs, commits o chat; para mostrar la configuración usa solo los nombres (`sed 's/=.*/=/'`). Si aparece un secreto en un archivo versionado, avisa antes de seguir.
3. Antes de **borrar o sobrescribir** algo, mira qué hay. Acciones difíciles de revertir o que salen del repo: confirma antes.
4. Las decisiones ya tomadas (abajo) **no se reabren** sin motivo nuevo; si una contradice lo que ves, plantéalo, no la cambies en silencio.
5. Termina cada bloque de trabajo con: qué cambió, qué se verificó (cifras reales), qué no se cubrió y qué decide el dueño. Explica en lenguaje llano; evita jerga cuando no hace falta.

## Decisiones vigentes
- **Tenant explícito:** `tenantId` del JWT en cada comando/consulta y cada handler filtra por él. Nada implícito.
- **DTOs** en `infrastructure/dtos`; comandos/consultas **planos**; `application` no importa de `infrastructure`.
- **Errores:** solo `AppException(ErrorCode.X, …)` / `DomainError`; el front decide por `code`. Documenta cada código (`python3 scripts/generate-error-catalog.py`).
- **Cero `any`**; el lint estricto no se silencia. La deuda heredada (`eslint-suppressions.json`) solo baja (`pnpm lint:prune`).
- **Estados como `varchar` en la BD**, `enum` solo en el código (el dueño rechazó enums de Postgres). Columnas con enum de TS: `type: 'varchar'` explícito.
- **Dinero con `Money`** (centavos exactos), nunca `number` con flotantes. Devoluciones de ventas con tarjeta siguen restando efectivo de la caja (decisión actual).
- **Sucursales:** quien no es propietario necesita asignación explícita; el propietario (`isOwner`) lo puede todo. Cualquier cajero asignado a una caja puede usar su turno abierto. El cajero puede cambiar el precio a mano.
- **Nadie concede más permisos de los que tiene** (`PERMISSION_ESCALATION`).
- **SKU** en MAYÚSCULAS y recortado en todo el sistema (`normalizeSku`); SKU base único por tienda; el SKU base no puede coincidir con el SKU de una variante de otro producto.
- **CONSUMIDOR FINAL** (`9999999999999`) es el comprador por defecto e intocable. `clientRequestId` en ventas es opcional hoy, **obligatorio en el futuro**.
- **Backend primero, luego el front** (Fase 3), luego móvil, luego infra y `test-docker`.
- Stack fijado: TS 6.0.x, pnpm 11, Node 24, NestJS 11, Postgres 16, Redis 7.

## Comandos
```bash
pnpm typecheck && pnpm lint && pnpm test      # = pnpm verify
pnpm test:integration                         # Postgres + Redis reales (crea y borra su propia base)
pnpm build
pnpm migration:run                            # BD local de desarrollo
pnpm lint:prune                               # tras arreglar infracciones heredadas
python3 scripts/generate-error-catalog.py     # tras añadir un ErrorCode
```
Cifras de referencia al cierre de la fase backend: **431 unitarios + 313 de integración en verde**, 131 supresiones de lint (empezó en 538), los 93 handlers cubiertos. Si una cifra baja, algo se rompió.

## Cómo trabajar un cambio (checklist)
**Funcionalidad nueva (handler)**
1. DTO en `infrastructure/dtos` → controller sin lógica → comando/consulta plano → handler con `Logger`, transacción si escribe, `tenantId` en cada consulta.
2. ¿Toca varias filas de stock/caja? Bloquea **en orden fijo** y usa los servicios existentes (`consumeStock`, `receiveStock`, `lockCashSession`, `reserveInvoiceNumber`).
3. ¿Recibe ids del cliente? Valídalos contra la tienda. ¿Lista datos de sucursales? Filtra por `visibleBranchIds` / `assertUserCanAccessBranch`.
4. Regla de negocio no trivial → función pura en `domain/` con test unitario.
5. Códigos de error nuevos → `ErrorCode` + regenerar el catálogo.
6. **Test de integración** en `test/integration/` (patrón: `startTestDatabase`, `seedTenant`, handlers reales). Todo handler debe aparecer en algún test.

**Corregir un defecto**
1. Escribe primero el test que lo reproduce y **comprueba que falla**.
2. Corrige. 3. Comprueba que pasa. 4. Para carreras: quita temporalmente el bloqueo/índice y confirma que el test falla (si no falla, el test no sirve; hazlo más agresivo, p. ej. varias rondas concurrentes).

**Migraciones:** ver `docs/database.md`. Si añade unicidad sobre datos existentes: detectar duplicados y **detenerse con mensaje claro**, nunca borrar. Todas corren en una sola transacción (sin `CONCURRENTLY`). Revisa las autogeneradas (una re-creó restricciones globales ya eliminadas). Un test debe ejercitar la migración.

## Patrones que ya salvaron al proyecto (úsalos)
- Una violación única de Postgres **nunca escapa cruda**: `isUniqueViolation` → error de negocio. Comprobación previa para el mensaje preciso + índice único como red de seguridad.
- Consultas de hijos (variante, turno, sesión): **filtrar también por `tenantId`** (fuga real: producto por id de variante).
- Búsquedas de texto: `containsPattern`; filtros de query: `blankToUndefined` + `@IsUUID()`; SQL crudo: `SqlParams`.
- Efectos externos (caché, revocar sesión, S3) **después** de confirmar la transacción.
- Lecturas masivas: una consulta por tipo, no una por fila (se corrigieron N+1 en compras y alta de productos).

## Entorno local (trampas conocidas)
- **zsh** expande comodines: entrecomilla (`'--include=*.ts'`) o usa `Grep`/`find`.
- **macOS no tiene `timeout`**: usa `perl -e 'alarm 240; exec @ARGV' <comando>`.
- La extensión **Console Ninja** inyecta ruido en la salida de Jest (redirige a un archivo y filtra con `grep -a`) y **una vez corrompió `node_modules/@nestjs/core/index.js`** (el backend salía con código 0 sin arrancar). Comprobación: `node -e "console.log(typeof require('@nestjs/core').NestFactory)"` debe imprimir `function`.
- Si `node_modules` quedó con versiones antiguas: `pnpm install --offline --frozen-lockfile`.
- Postgres local (Homebrew) no tiene el rol `postgres`: para reproducir el CI usa Docker (ver README). La base de desarrollo es `pos_store`; puede tener **migraciones pendientes** (`pnpm typeorm migration:show -d src/config/data-source.ts`); el código nuevo falla con 500 si faltan.
- Las herramientas `Edit`/`Write` exigen haber leído el archivo antes en la sesión.
- Un chequeo de seguridad del entorno puede bloquear comandos que contengan texto tipo inyección SQL dentro de un heredoc: usa la herramienta de escritura de archivos.
- Los tests de integración HTTP (`http-flow`) pueden dar un fallo intermitente (`socket hang up`) bajo carga; se ha visto una vez y no se reprodujo.

## Mapa rápido de archivos clave
- Reglas del núcleo: `src/modules/sales/domain/services/{sale-pricing,cash-closing,refund-plan,invoice-number}.ts`, `src/modules/products/domain/services/stock-rules.ts`, `src/modules/products/domain/sku.ts`, `src/modules/reports/domain/inventory-valuation.ts`.
- Inventario/caja: `src/modules/products/application/services/{inventory-stock,initial-stock,base-sku,sku-conflict}.ts`, `src/modules/sales/application/commands/shared/{cash-session-lock,invoice-number,cash-register-access}.ts`.
- Seguridad: `src/common/security/{branch-access.helper,privilege-escalation,tenant-ownership,permissions.helper}.ts`, `src/modules/auth/domain/{login-throttle,effective-permissions,default-roles}.ts`, `src/modules/auth/services/auth-token.service.ts`.
- Errores: `src/common/errors/{error-codes,app.exception,all-exceptions.filter,database-errors}.ts`.
- Utilidades: `src/common/utils/{like,pagination,query-values,sql-params,timezone}.ts`, `src/common/domain/money.ts`.
- Arranque HTTP común: `src/app.setup.ts`. Entorno: `src/config/env.validation.ts`.
- Reglas automáticas: `src/architecture.spec.ts`, `src/common/security/endpoint-access.spec.ts`.
- Tests de integración y su infraestructura: `test/integration/`, `test/integration/support/`.

## Pendiente (resumen; completo en `docs/project-history.md` §6)
Probar front y móvil contra este backend (nunca hecho) → Fase 3 (front web con Clean Architecture, consumiendo `code`) → Fase 4 móvil → Fase 5 infra. Antes de desplegar: rotar los secretos (recomendado), comprobaciones de duplicados y backup (`docs/deployment.md`). En el backend: 131 supresiones de lint, y el Administrador por defecto recibe casi todos los permisos (decisión pendiente del dueño).
