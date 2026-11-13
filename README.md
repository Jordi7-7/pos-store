# pos-store — API del POS/ERP multitenant

Backend de un sistema **POS / ERP SaaS** para tiendas: ventas con turnos de caja, inventario por sucursal con costo FIFO, compras, catálogo con variantes, clientes, proveedores, reportes y panel. Cada tienda (tenant) está aislada de las demás; dentro de una tienda, cada usuario ve solo sus sucursales.

**Stack:** NestJS 11 · CQRS (`@nestjs/cqrs`) · TypeORM 1.0 · PostgreSQL 16 · Redis 7 · JWT con refresh rotatorio · Cloudflare R2 (API S3) para imágenes · TypeScript 6 · pnpm 11 · Node 24 · Jest 30.

Forma parte de un monorepo con `pos-store-front` (web React), `pos-store-mobile` (Expo) y `test-docker` (despliegue). Este repositorio es **solo el backend**.

---

## Documentación

| Documento | Para qué |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Reglas de trabajo y contexto completo (léelo primero si vas a modificar código) |
| [`architecture_guide.md`](architecture_guide.md) | Arquitectura, convenciones y reglas que el código debe cumplir |
| [`docs/database.md`](docs/database.md) | Esquema, restricciones únicas, concurrencia y cómo escribir migraciones |
| [`docs/deployment.md`](docs/deployment.md) | Despliegue: variables, comprobaciones previas, migraciones, marcha atrás |
| [`docs/error-codes.md`](docs/error-codes.md) | Catálogo de códigos de error (el front y el móvil deciden por `code`) |
| [`docs/project-history.md`](docs/project-history.md) | Historia del refactor, decisiones y trabajo pendiente |

---

## Puesta en marcha (desarrollo)

Requisitos: Node 24, pnpm 11, PostgreSQL 16 y Redis 7 (Docker sirve para los dos).

```bash
pnpm install

# Redis (el docker-compose de esta carpeta solo levanta Redis)
docker compose up -d redis
# PostgreSQL: usa una instancia local o un contenedor; crea la base y apunta DB_* a ella

cp .env.example .env          # ← rellena con TUS valores; .env.example no debe contener secretos reales
pnpm migration:run            # aplica el esquema
pnpm start:dev                # http://localhost:3000   (GET /health)
```

### Variables de entorno
Descritas en [`docs/deployment.md` §2](docs/deployment.md). Las críticas (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DB_PASSWORD`, y `CORS_ORIGINS` en producción) **hacen que la API no arranque** si faltan o son inseguras.

### Dar de alta una tienda
`POST /auth/onboard` (protegido con la cabecera `x-onboarding-key` = `ONBOARDING_API_KEY`) crea la tienda, su sucursal inicial, el propietario, tres roles (Administrador, Gerente / Supervisor, Cajero), un proveedor `GENERICO` y el cliente `CONSUMIDOR FINAL`. Después se inicia sesión con el `slug` de la tienda.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm start:dev` / `start:prod` | Arranque con recarga / desde `dist` |
| `pnpm build` | Compila a `dist/` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint estricto (sin `--fix`); la deuda heredada está en `eslint-suppressions.json` |
| `pnpm lint:prune` | Retira de esa lista lo que ya se arregló |
| `pnpm test` | Tests unitarios (rápidos, sin base de datos) |
| `pnpm test:integration` | Tests de integración contra **Postgres y Redis reales** |
| `pnpm verify` | `typecheck` + `lint` + `test` (lo mínimo antes de subir cambios) |
| `pnpm migration:run` / `migration:revert` | Aplica / deshace una migración (desarrollo) |
| `pnpm migration:run:prod` | Aplica migraciones desde `dist` (producción) |
| `python3 scripts/generate-error-catalog.py` | Regenera `docs/error-codes.md` |

### Tests de integración
Necesitan Postgres y Redis accesibles con las variables `DB_*` y `REDIS_*` (el usuario debe poder crear bases). Cada suite **crea una base con nombre único, aplica las migraciones y la borra al terminar**; no toca la base configurada. Para reproducir el CI en local:

```bash
docker run -d --name pg-it -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
docker run -d --name redis-it -p 6379:6379 redis:7-alpine
DB_HOST=localhost DB_PORT=5432 DB_USERNAME=postgres DB_PASSWORD=postgres DB_DATABASE=postgres \
REDIS_HOST=localhost REDIS_PORT=6379 pnpm test:integration
```

---

## Estructura

```
src/
  common/            Money, errores, seguridad, utilidades compartidas
  config/            validación de entorno, conexión a la BD
  database/migrations/
  modules/           auth, batches, branches, customers, dashboard, media, products,
                     purchases, reports, roles, sales, tenants, users
    <modulo>/{domain, application/{commands,queries,services}, infrastructure/{controllers,dtos}}
test/integration/    flujos reales sobre Postgres + Redis
docs/                base de datos, despliegue, errores, historia
```

## Contrato de la API en dos líneas

- **Autenticación:** `Authorization: Bearer <access token>`; `POST /auth/refresh` rota el refresh token.
- **Errores:** todas las respuestas de error son `{ statusCode, code, message, details?, path, timestamp, requestId }`. Los clientes deben decidir qué mostrar por **`code`** (ver `docs/error-codes.md`). El `requestId` también viaja en `x-request-id`: pídelo al reportar un fallo.

Colección de ejemplos: `postman/POS_Store_API.postman_collection.json`.

## Reglas para contribuir (resumen)

1. Escrituras como **comando + handler** en transacción; `tenantId` explícito y filtrado en cada consulta.
2. Errores con `AppException(ErrorCode.X, …)`, nunca excepciones HTTP sueltas; documenta el código nuevo.
3. Dinero con `Money`; SKU con `normalizeSku`; nada de `any`.
4. Todo defecto de dinero, stock, permisos o concurrencia lleva **un test que falla sin la corrección**.
5. `pnpm verify` y `pnpm test:integration` en verde antes de subir.

Licencia: privada (`UNLICENSED`).
