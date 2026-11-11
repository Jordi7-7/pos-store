# Despliegue del backend (`pos-store`)

Guía para llevar el backend a producción sin sorpresas. Léela **completa antes de desplegar** una versión que incluya migraciones nuevas: varias se detienen a propósito si los datos no cumplen una regla, y algunas no se pueden revertir.

> Nunca pegues valores reales de secretos en este documento, en commits ni en chats. Los secretos viven solo en el `.env` real (ignorado por git) y en el entorno de producción; `.env.example` es una **plantilla con marcadores `<…>`** y el arranque **rechaza** los marcadores sin rellenar.

---

## 1. Qué se despliega

| Pieza | Imagen / versión | Notas |
|---|---|---|
| API NestJS | `ghcr.io/<owner>/pos-store-backend` (`latest` y `sha-<corto>`) | La construye `.github/workflows/deploy.yml` al hacer push a `main`, **solo si pasa el CI** |
| PostgreSQL | `postgres:16-alpine` | Misma versión que usa el CI |
| Redis | `redis:7-alpine` | Sesiones (refresh tokens), contadores del límite de intentos de login y caché de sucursales por usuario |
| Almacenamiento de imágenes | Cloudflare R2 (API S3) | Variables `AWS_*` |
| Proxy | Caddy (`/api/*` → API, resto → frontend) | Ver `../test-docker/` |

Pipeline (`.github/workflows/`): `ci.yml` (typecheck, lint, tests unitarios, build y tests de integración con Postgres 16 y Redis 7) → `deploy.yml` (llama al CI, construye y publica la imagen). Si el CI falla, no se publica imagen.

---

## 2. Variables de entorno

Nombres, no valores. Las marcadas **obligatoria** hacen que la API **no arranque** si faltan o son inseguras (`src/config/env.validation.ts`).

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NODE_ENV` | sí en producción | Debe ser `production`. Activa la obligatoriedad de `CORS_ORIGINS` y el rechazo de contraseñas de BD inseguras |
| `PORT` | no (3000) | Puerto de la API |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_DATABASE` | sí en la práctica | Conexión a Postgres. `synchronize` está **desactivado**: el esquema solo cambia por migraciones |
| `DB_PASSWORD` | **sí** | En producción no puede ser `postgres`, `changeme`, `secret`… |
| `DB_LOGGING` | no | `true` activa el log de SQL (solo depuración) |
| `JWT_SECRET` | **sí** | Mínimo 16 caracteres; no `fallback_secret`/`secret`/… |
| `JWT_EXPIRES_IN` | no | Vida del access token (corta, p. ej. 15m) |
| `REFRESH_TOKEN_SECRET` | **sí** | Distinto de `JWT_SECRET`, mínimo 16 caracteres |
| `REFRESH_TOKEN_EXPIRES_IN` | no | Vida del refresh token (7 días por defecto en Redis) |
| `ONBOARDING_API_KEY` | sí para dar de alta tiendas | Cabecera `x-onboarding-key` (o `x-api-key`) del endpoint de onboarding. Sin ella el endpoint responde 401 |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | sí en la práctica | Sin Redis no hay refresh, ni límite de intentos de login |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`, `AWS_S3_ENDPOINT`, `AWS_S3_PUBLIC_URL` | para imágenes | Credenciales y endpoint de R2 |
| `CORS_ORIGINS` | **sí en producción** | Orígenes permitidos separados por coma (`https://app.midominio.com,https://…`). Fuera de producción, vacío = abierto |
| `AUTH_COOKIE_PATH` | **sí en producción con Caddy** | Ruta de la cookie de sesión web tal como la ve el navegador. Caddy publica la API bajo `/api`, así que debe ser **`/api/auth/web`** (por defecto `/auth/web`, que solo sirve sin prefijo, como en desarrollo). Si no coincide con la ruta real, el navegador no manda la cookie y la web pide iniciar sesión en cada recarga |
| `AUTH_COOKIE_SECURE` | no | `true`/`false`. Por defecto es `true` con `NODE_ENV=production`: la cookie solo viaja por HTTPS. Pon `false` solo si la web se sirve por `http://` (p. ej. pruebas locales con `NODE_ENV=production`) |
| `AUTH_COOKIE_NAME` | no (`pos_rt`) | Nombre de la cookie del refresh token de la web |
| `TRUST_PROXY` | recomendada | Nº de proxies delante de la API. **`1` con Caddy**. Sin esto la IP del cliente es la del proxy y el límite de intentos de login por IP deja de funcionar |

### Rotación de secretos (recomendada antes de exponer el sistema)
Una revisión de los tres repositorios (archivos versionados **y todo el historial**) confirmó que **ningún secreto actual se ha subido a git**. Aun así conviene rotarlos antes de abrir el sistema al público, porque los valores han pasado por herramientas y sesiones de trabajo fuera del control de versiones. Genera nuevos (`openssl rand -base64 48`) y cámbialos en el entorno de producción:
- `JWT_SECRET` y `REFRESH_TOKEN_SECRET` (distintos entre sí, ≥ 32 caracteres). **Efecto:** invalida todas las sesiones abiertas; los usuarios tendrán que volver a iniciar sesión.
- `ONBOARDING_API_KEY`.
- Claves de R2 (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) desde el panel de Cloudflare; revoca las antiguas.
- Contraseñas de Postgres y Redis.

---

## 3. Antes de desplegar: comprobaciones de datos

Ejecuta estas consultas **contra la base de producción** (solo lectura). Cada una anticipa una migración que se detendría. Si devuelven filas, resuélvelas antes de migrar.

```sql
-- 1) Dos turnos abiertos en la misma caja (migración 1792900000000)
SELECT cash_register_id, COUNT(*) FROM cash_sessions
WHERE status = 'OPEN' AND cash_register_id IS NOT NULL
GROUP BY 1 HAVING COUNT(*) > 1;

-- 2) Proveedores con el mismo documento en una tienda (1793300000000)
SELECT tenant_id, identity_number, COUNT(*) FROM suppliers
WHERE deleted_at IS NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;

-- 3) SKU base de producto repetido, sin distinguir mayúsculas (1793600000000)
SELECT tenant_id, UPPER(base_sku), COUNT(*) FROM products
WHERE deleted_at IS NULL AND base_sku IS NOT NULL AND base_sku <> ''
GROUP BY 1, 2 HAVING COUNT(*) > 1;

-- 4) SKUs de variante que solo difieren en mayúsculas o espacios (1793700000000)
SELECT tenant_id, UPPER(BTRIM(sku)), COUNT(*) FROM product_variants
WHERE deleted_at IS NULL GROUP BY 1, 2 HAVING COUNT(*) > 1;
```

Nota sobre la 3): la migración primero **realinea** el SKU base de los productos simples con el SKU de su variante, así que una consulta previa puede mostrar duplicados que la propia migración corrige. La definitiva es lo que la migración reporte.

Cómo resolver un duplicado: renombra uno de los registros (p. ej. añade un sufijo al SKU o al documento) desde la aplicación o con un `UPDATE` puntual, y vuelve a ejecutar la consulta hasta que no devuelva filas. **No borres** registros con compras o ventas asociadas.

### PIN antiguos
Los PIN se guardan con hash, no se pueden consultar. Hubo tiendas dadas de alta con el PIN fijo `000000`. Comprueba si queda alguno con este script (solo lectura):

```bash
node -e "
require('dotenv').config(); const {Client}=require('pg'); const bcrypt=require('bcryptjs');
(async()=>{const c=new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE});
await c.connect(); const {rows}=await c.query('SELECT id, username, tenant_id, pin FROM users WHERE pin IS NOT NULL');
for (const u of rows) if (await bcrypt.compare('000000', u.pin)) console.log('PIN 000000:', u.username, u.tenant_id);
await c.end();})()"
```
A quien salga, genera un PIN nuevo desde Usuarios → «Generar PIN» (lo muestra una sola vez).

---

## 4. Orden de despliegue

1. **Copia de seguridad** de la base: `pg_dump -Fc -h <host> -U <usuario> <base> > pos_store_$(date +%F).dump`. Comprueba que el archivo no está vacío. Es la única vía de vuelta para las migraciones irreversibles (§5).
2. Ejecuta las **comprobaciones de datos** (§3) y resuélvelas.
3. **Ventana tranquila** (poco tráfico): la migración de índices bloquea escrituras mientras los crea (no se usa `CONCURRENTLY` porque TypeORM ejecuta las migraciones en una transacción).
4. Ejecuta las **migraciones como un paso aparte**, antes de arrancar la API nueva:
   ```bash
   pnpm migration:run:prod        # = typeorm migration:run -d dist/config/data-source.js
   ```
   Comprueba cuáles faltan antes: `pnpm typeorm migration:show -d dist/config/data-source.js` (`[ ]` = pendiente). Todas corren en **una sola transacción**: si una falla, no se aplica ninguna.
5. Arranca la **nueva versión de la API** (`node dist/main`). Con las migraciones aplicadas el código nuevo funciona; con la versión antigua de la API y la base ya migrada, también (las migraciones son compatibles hacia atrás salvo lo indicado en §5).
6. **Verificación posterior** (§7).

> **Importante:** el código nuevo **falla con un 500** si la base no tiene las migraciones (por ejemplo `column Sale.client_request_id does not exist`). Migra siempre antes de arrancar la API.

### Migraciones recientes y su riesgo

| Migración | Qué hace | Riesgo |
|---|---|---|
| `1792900000000` AddUniqueOpenSessionPerCashRegister | Una caja solo puede tener un turno abierto | Se detiene si hay duplicados (§3.1) |
| `1793000000000` AddQueryAndForeignKeyIndexes | Índices en ventas, lotes, stock, etc. | Bloquea escrituras mientras se crean; hacerla en ventana tranquila |
| `1793100000000` ScopeUserEmailUniquenessToTenant | El correo y el usuario son únicos **por tienda** (antes el correo era global) | Solo quita una restricción; sin riesgo de datos. `down` vacío |
| `1793200000000` MakeCustomerIdentityUniqueAmongActive | El documento del cliente es único entre clientes activos (un cliente borrado libera su documento) | Bajo |
| `1793300000000` AddUniqueSupplierIdentityPerTenant | Documento de proveedor único por tienda | Se detiene si hay duplicados (§3.2) |
| `1793400000000` AddClientRequestIdToSales | Columna `client_request_id` + índice único por tienda (idempotencia de ventas) | Bajo |
| `1793500000000` BackfillConsumerFinalOnSales | Asigna el CONSUMIDOR FINAL (`9999999999999`) a ventas sin cliente y lo crea si falta | `UPDATE` sobre `sales`; en tablas grandes puede tardar. `down` vacío |
| `1793600000000` AddUniqueProductBaseSkuPerTenant | SKU base de producto único por tienda (sin distinguir mayúsculas); realinea el de los simples | Se detiene si hay duplicados (§3.3) |
| `1793700000000` NormalizeVariantSkusToUppercase | Todos los SKU de variante recortados y en MAYÚSCULAS | **Irreversible** (no recupera la capitalización). Se detiene si hay duplicados (§3.4) |
| `1793800000000` AddOfflineReferenceToSales | Columna `offline_reference` + índice único por tienda (número provisional de las ventas hechas sin conexión) | Bajo: solo añade una columna opcional |
| `1793900000000` AddProductStocksChangeIndex | Índice parcial `(branch_id, updated_at, variant_id)` en `product_stocks` para descargar existencias por cambios | Bajo: solo añade un índice (se crea bloqueando escrituras de esa tabla unos segundos; hacerla en ventana tranquila) |

Las anteriores (`1792699800000` en adelante: propietario sin rol, usuario obligatorio, etc.) también pueden estar pendientes: confírmalo con `migration:show`.

---

## 5. Marcha atrás

- `pnpm migration:revert` deshace **una** migración (la última). Las de `down` vacío (`1793100000000`, `1793500000000`, `1793700000000`) **no devuelven los datos** a su estado anterior.
- Para volver de verdad a la versión anterior tras una migración irreversible: **restaurar la copia de seguridad** (`pg_restore`) y desplegar la imagen anterior (`sha-<corto>`).
- Por eso la copia de seguridad (§4.1) es obligatoria, no opcional.

---

## 6. Cambios visibles para el front y el móvil

Comunícalos antes de desplegar; ninguno rompe a un cliente que ya maneja el contrato de errores, pero cambian lo que ve el usuario:

- **Errores con `code`:** el cliente debe decidir qué mostrar por `code`, no por `message`. Catálogo completo en `docs/error-codes.md`. Códigos nuevos relevantes: `TOO_MANY_ATTEMPTS` (429), `PERMISSION_ESCALATION` (403), `BRANCH_ACCESS_DENIED` (403), `BASE_SKU_TAKEN`, `SKU_TAKEN`, `CONSUMER_FINAL_PROTECTED`, `IDEMPOTENCY_KEY_REUSED`, `CASH_REGISTER_INACTIVE`, `EMPTY_PURCHASE`, `DUPLICATE_SKU_IN_IMPORT`, `SERVICE_UNAVAILABLE`.
- **Login:** puede responder 429 tras 5 fallos por cuenta e IP (20 por cuenta, 100 por IP, ventana de 15 min).
- **SKU en mayúsculas:** los SKU se guardan y se devuelven en MAYÚSCULAS; las búsquedas aceptan cualquier capitalización.
- **Comprador por defecto:** una venta sin `customerId` se asigna al CONSUMIDOR FINAL de la tienda.
- **Idempotencia:** `POST /sales` acepta `clientRequestId` (opcional hoy, 8–64 caracteres). Un reintento con el mismo valor devuelve la venta ya creada. Se volverá obligatorio cuando el front y el móvil lo envíen.
- **Sucursales:** quien no es propietario ve solo lo de sus sucursales en devoluciones, gastos, turnos de caja y venta por folio (403 `BRANCH_ACCESS_DENIED` si pide algo ajeno).
- **Sesión web con cookie:** nuevos `POST /auth/web/login`, `/auth/web/pin-login`, `/auth/web/refresh` y `/auth/web/logout`. El refresh token viaja en una cookie `HttpOnly; SameSite=Strict` (`pos_rt`) y nunca en el cuerpo; el cuerpo devuelve solo `accessToken`. Exigen la cabecera `X-Requested-With: pos-web`. Los endpoints `/auth/*` del móvil no cambian. CORS ahora admite credenciales solo para los orígenes de `CORS_ORIGINS` (y `localhost` si no está definida). **Despliega el backend antes que la web** y configura `AUTH_COOKIE_PATH=/api/auth/web`; al desplegar la web nueva todos los usuarios deberán iniciar sesión una vez.
- **Ventas hechas sin conexión (ruta nueva, aditiva):** `POST /sales/offline` sincroniza una venta hecha sin conexión con la misma lógica que `POST /sales` (precios, stock, folio, idempotencia). Exige `clientRequestId`, `occurredAt` (hora real del cobro, ISO 8601; se acota a la apertura del turno y a "ahora") y `offlineReference` (número provisional impreso, 6–40 caracteres, se guarda en MAYÚSCULAS y es único por tienda; repetido en otra venta → 409 `OFFLINE_REFERENCE_TAKEN`). `POST /sales` no cambia y ignora esos dos campos. `GET /sales/invoice/:folio` encuentra la venta por el folio definitivo o por el provisional y devuelve `offlineReference`. Las ventas ya se aceptan con stock insuficiente (el stock queda en negativo) y con el turno cerrado se rechazan con `NO_OPEN_CASH_SESSION`.
- **Catálogo para vender sin conexión (ruta nueva, aditiva):** `GET /products/pos/catalog?after=<cursor>&limit=<1-2000>` devuelve el catálogo de la tienda por páginas y por cambios (`items`, `cursor`, `hasMore`): sin `after` baja todo; con el cursor de la descarga anterior solo lo modificado (o su producto) y lo borrado (`deleted: true`). Trae SKU, código de barras, producto, SKU base, precios y atributos; sin stock ni imágenes. Permisos: `PRODUCTS_GET` o `POS_SELL`. La app móvil lo descarga al iniciar sesión y cada 6 horas.
- **Existencias para vender sin conexión (ruta nueva, aditiva):** `GET /products/pos/stock?branchId=<uuid>&after=<cursor>&limit=<1-2000>` devuelve las existencias de UNA sucursal (`items: [{ variantId, quantity }]`, `cursor`, `hasMore`), por páginas y por cambios (mismo cursor que el catálogo). Exige acceso a esa sucursal (un usuario no propietario sin ella recibe 403 `BRANCH_ACCESS_DENIED`) y `branchId` UUID válido (400 si no). La cantidad puede ser negativa. Permisos: `PRODUCTS_GET` o `POS_SELL`.
- **Pagos:** el servidor guarda de cada pago solo lo que cubre el total de la venta (el vuelto no es ingreso).

---

## 7. Verificación posterior

1. `GET /health` → 200 (comprueba la conexión a la base de datos; 503 `SERVICE_UNAVAILABLE` si falla).
2. Inicio de sesión de un usuario real y de uno con rol limitado.
3. Flujo mínimo: abrir caja → vender → devolver una unidad → cerrar caja → ver el detalle del turno (el efectivo esperado debe cuadrar).
4. Revisa los logs de la API unos minutos: **ningún 500** nuevo. Cada error lleva `requestId` (también en la cabecera `x-request-id`).
5. Comprueba que las ventas antiguas muestran comprador (CONSUMIDOR FINAL) y que el reporte de costo de ventas carga.

---

## 8. Observaciones de infraestructura (pendientes, Fase 5 del plan)

Detectadas al revisar `Dockerfile` y `../test-docker/docker-compose.yml`. Ya hay compose de producción en `../test-docker/prod/` con healthcheck y los arreglos de imagen de pnpm y dotenv están hechos; **siguen pendientes** los demás puntos (migraciones como job aparte, HTTPS y cabeceras en Caddy, etiquetas fijas, root en el contenedor, versionar `test-docker`):

- El `command` de la API en el compose ejecuta `pnpm run migration:run:prod && node dist/main.js`: **las migraciones corren en cada arranque** y, con varias réplicas, competirían. Con una sola réplica es aceptable. Recomendado a futuro: un job único previo (`node node_modules/typeorm/cli.js migration:run -d dist/config/data-source.js`) y la API arranca solo con `node dist/main`.
- La imagen final **sí instala `pnpm` 11.17.0** (necesario para `pnpm run migration:run:prod`) y define `pnpm_config_verify_deps_before_run=false`; sin esa variable, `pnpm run` reinstalaba ~700 paquetes en cada arranque. `dotenv` está en `dependencies` (lo usa `data-source.ts`) para que sobreviva a `pnpm prune --prod`.
- `Dockerfile`: `--dangerously-allow-all-builds` en la etapa de build; el contenedor corre como root. El compose de producción ya define un healthcheck contra `GET /health`.
- Imágenes con la etiqueta `latest`: el compose de producción acepta `BACKEND_TAG` y `FRONTEND_TAG` en el `.env`; fíjalas a `sha-<corto>` para poder volver atrás.
- Redis con contraseña y accesible solo desde la red interna (ya lo está en el compose); Postgres solo en `127.0.0.1`.
- `Caddyfile`: usa `:80`; en producción necesita dominio + HTTPS y cabeceras de seguridad (el backend ya aplica `helmet`).
- `test-docker/` no está en control de versiones.
