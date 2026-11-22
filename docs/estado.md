# Estado del backend

**Esto caduca.** Es una foto con fechas, no una regla; contrástala con `git log` / `git status`. Las reglas viven en `../CLAUDE.md` y `../architecture_guide.md`. Historia y porqué de las decisiones: `project-history.md`. Última revisión: 2026-11-22.

## Cifras medidas
| Comprobación | Resultado | Fecha |
|---|---|---|
| `pnpm test` (unitarios) | 481 en verde, 75 suites | 2026-11-22 |
| `pnpm test:integration` | 340 en verde; **no vuelto a medir** (necesita Postgres y Redis; hay archivos de integración nuevos desde entonces) | 2026-11-11 |
| Supresiones de lint (`eslint-suppressions.json`) | 131 (empezó en 538) | 2026-11-22 |

Si una cifra baja o las supresiones suben, algo se rompió.

## Dónde está
- Refactor del backend **terminado y desplegado** (según el dueño, 2026-11-09). La web y el móvil ya se probaron contra este backend.
- **Offline (solo ventas, móvil):** `POST /sales/offline`, `GET /products/pos/catalog` y `GET /products/pos/stock?branchId=` hechos y commiteados (2026-11-11). Detalle en `deployment.md`.
- **Trabajo en curso sin commit (2026-11-22):** documentos de inventario (ingreso/ajuste/conteo/traspaso) con migraciones `1794…` nuevas y permisos de stock. No lo comitees sin preguntar.

## Deuda conocida
- 131 supresiones de lint heredadas (sobre todo `sales.controller`, `purchases.controller`, `redis.service`, `branch-access.helper`, `logging.interceptor`, `close-cash-session`).
- `GetCashRegisters` (listado administrativo) no filtra por sucursal para quien no es propietario.
- El costo promedio de una compra usa el stock total de todas las sucursales.
- Los barcodes no se normalizan ni se comprueba que no choquen con un SKU base.
- `GetPosVariants` devuelve todo el catálogo sin paginar a propósito; pesará con decenas de miles de variantes (el catálogo offline por páginas ya lo cubre en el móvil).

## Antes de desplegar migraciones
Comprobaciones de duplicados y backup (`deployment.md`). Rotar los secretos sigue recomendado.

## Decisiones de negocio por confirmar con el dueño (revisión del 2026-11-22; el código no se ha cambiado)
No las cambies por tu cuenta; si trabajas cerca, plantéaselas.
1. **Devolución de una venta con tarjeta resta efectivo de la caja** («decisión actual» en `../CLAUDE.md`): parece descuadrar el arqueo; confirmar si es lo que quiere.
2. **El cajero cambia el precio a mano sin permiso propio**: valorar un permiso específico y dejar registro de quién lo cambió.
3. **Un solo refresh token por usuario** (`refresh_token:<userId>`): iniciar sesión en la web cierra la del móvil. Valorar una sesión por dispositivo.
4. **El Administrador por defecto recibe casi todos los permisos** (fijado en un test; pendiente de decisión).
5. **`clientRequestId` obligatorio:** falta fijar el criterio (p. ej. versión mínima de app exigida) antes de volverlo obligatorio.
