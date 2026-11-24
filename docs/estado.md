# Estado del backend

**Esto caduca.** Es una foto con fechas, no una regla; contrástala con `git log` / `git status`. Las reglas viven en `../CLAUDE.md` y `../architecture_guide.md`. Historia y porqué de las decisiones: `project-history.md`. Última revisión: 2026-11-22.

## Cifras medidas
| Comprobación | Resultado | Fecha |
|---|---|---|
| `pnpm test` (unitarios) | 488 en verde, 75 suites | 2026-11-24 |
| `pnpm test:integration` | 483 en verde, 31 suites (Postgres y Redis reales); `web-auth-flow` › logout es intermitente (ver abajo) | 2026-11-24 |
| `scripts/reconcile-inventory.sql` (base de desarrollo) | documentos y contadores coherentes; cadena de saldos del kardex sin anomalías; **7 de 7.502** filas de existencia no cuadran con las capas FIFO (ver abajo) | 2026-11-24 |
| Supresiones de lint (`eslint-suppressions.json`) | 131 (empezó en 538) | 2026-11-22 |

Si una cifra baja o las supresiones suben, algo se rompió.

## Dónde está
- Refactor del backend **terminado y desplegado** (según el dueño, 2026-11-09). La web y el móvil ya se probaron contra este backend.
- **Offline (solo ventas, móvil):** `POST /sales/offline`, `GET /products/pos/catalog` y `GET /products/pos/stock?branchId=` hechos y commiteados (2026-11-11). Detalle en `deployment.md`.
- **Trabajo en curso sin commit (2026-11-22):** documentos de inventario (ingreso/ajuste/conteo/traspaso) con migraciones `1794…` nuevas y permisos de stock. No lo comitees sin preguntar.

## Conciliación de inventario
`scripts/reconcile-inventory.sql` (solo lectura) compara la existencia (`product_stocks`) con las capas FIFO y revisa los documentos y su numeración. En la base de **desarrollo** hay 7 filas de la tienda de pruebas que no cuadran (CAM-001, HL6895, HM-130, HM130, HM131, KH8784, WA0436); son anteriores a los documentos de inventario (último movimiento entre agosto y octubre) y el dueño decidió **dejarlas** porque son datos de prueba (2026-11-22). Ejecutar el script en producción antes y después de migrar (`deployment.md` §4).

## Deuda conocida
- 131 supresiones de lint heredadas (sobre todo `sales.controller`, `purchases.controller`, `redis.service`, `branch-access.helper`, `logging.interceptor`, `close-cash-session`).
- `GetCashRegisters` (listado administrativo) no filtra por sucursal para quien no es propietario.
- El costo promedio de una compra usa el stock total de todas las sucursales.
- Los barcodes no se normalizan ni se comprueba que no choquen con un SKU base.
- `GetPosVariants` devuelve todo el catálogo sin paginar a propósito; pesará con decenas de miles de variantes (el catálogo offline por páginas ya lo cubre en el móvil).

## Antes de desplegar migraciones
Comprobaciones de duplicados y backup (`deployment.md`). Rotar los secretos sigue recomendado.

## Rediseño de movimientos de inventario (2026-11-24)
Vocabulario acordado con el dueño: `direction` (IN/OUT) + `category` (INITIAL, PURCHASE, SALE, RETURN, ADJUSTMENT, COUNT, TRANSFER) + `reason` (7 motivos, solo en ajustes manuales) + `comment`.
- **Etapa A, hecha (solo código, sin migración):** los motivos que se pueden elegir son `DONACION`, `PRODUCCION`, `MERMA`, `PERDIDA`, `USO_INTERNO`, `DEVOLUCION_PROVEEDOR` y `OTRO` (`MANUAL_REASONS`); el conteo y el traslado ya no piden motivo (el sistema pone `CONTEO_FISICO` y `TRASLADO`); toda salida manual y todo `OTRO` exigen comentario de al menos 4 caracteres (`COMMENT_REQUIRED`); se retiró el ajuste antiguo. Los motivos antiguos (`CADUCIDAD`, `OTRO_INGRESO`, `REPOSICION`…) siguen en el enum para mostrar filas ya guardadas, pero ya no se aceptan.
- **Etapa B, hecha (2026-11-24):** el kardex gana `category` (INITIAL, PURCHASE, SALE, RETURN, ADJUSTMENT, COUNT, TRANSFER), `unit_cost` y `balance_after`; la web filtra el historial por categoría y muestra el saldo. Todos los flujos que mueven stock (stock inicial, compra y su anulación, venta, devolución, entrada/salida manual, conteo y traslado) escriben la línea por un único constructor (`newKardexLine`). Lo propio de un conteo (`counted`/`expected`) **no va en el kardex** (decisión del dueño: rompería la responsabilidad única y quedaría nulo en casi todas las filas) y por ahora no se guarda en ningún sitio; si hiciera falta auditar lo contado, iría en una tabla aparte `inventory_count_lines`.
  - Se borraron del enum los 7 motivos antiguos que nunca estuvieron en producción (`CADUCIDAD`, `OTRO_INGRESO`, `OTRO_EGRESO`, `OTRO_TRASLADO`, `CORRECCION`, `REPOSICION`, `BALANCEO`); queda `ADJUSTMENT` por las filas del ajuste antiguo.
  - Las migraciones nunca habían llegado a producción, así que se fusionaron: `1794000000000` (tablas, columnas y relleno de `category`) y `1794100000000` (permisos). En producción corren 2 migraciones en vez de 4.
  - `reason` sigue guardándose en todas las líneas (VENTA, COMPRA…) por compatibilidad: es redundante con `category` salvo en los ajustes manuales, donde sí detalla.
  - Las filas anteriores a la migración quedan con costo y saldo nulos (no se pueden reconstruir); la comprobación F de `reconcile-inventory.sql` solo cuenta las líneas con saldo.
- **Etapa C, pendiente:** anular documentos (`reversal_of_id`, en su propia migración).

## Pendiente de la revisión del 2026-11-22
- **Fila con tipo `INPUT` en desarrollo:** hay 1 movimiento (`INITIAL_STOCK`) con `type = 'INPUT'`, que no es ni `IN` ni `OUT`. Es de pruebas antiguas; la comprobación E2 del script la detecta. **Ejecutarla en producción antes de migrar** por si allí hubiera alguna.
- **Hallazgos de seguridad de la auditoría** (sin corregir): cerrar un turno no comprueba quién lo cierra (`close-cash-session`), `create-variant` no valida la sucursal del stock inicial contra la tienda y el panel (`get-dashboard-metrics`) no filtra por las sucursales visibles. Cada uno necesita primero un test que falle.
- **Migración `1794100000000`:** da conteo y traslado a todo rol que tenía «ajustar stock» (capacidades nuevas). Pendiente de decisión.
- **Permiso `action:products.adjust_stock`:** el ajuste antiguo (`POST /products/stock-adjustments`) se retiró el 2026-11-24, así que ese permiso ya no abre ningún endpoint. Sigue en el catálogo y en los roles por compatibilidad; decidir si se retira de `APP_PERMISSIONS` y de los roles por defecto.
- **Test intermitente:** `web-auth-flow` › «logout: revoca la sesión aunque el token de acceso haya vencido» falló 2 de ~12 ejecuciones (esperaba 401 y recibió 404 en `/auth/web/refresh`); no se reprodujo en 8 repeticiones seguidas con el cuerpo de la respuesta a la vista. El módulo de autenticación no se tocó en esos cambios.

## Decisiones de negocio por confirmar con el dueño (revisión del 2026-11-22; el código no se ha cambiado)
No las cambies por tu cuenta; si trabajas cerca, plantéaselas.
1. **Devolución de una venta con tarjeta resta efectivo de la caja** («decisión actual» en `../CLAUDE.md`): parece descuadrar el arqueo; confirmar si es lo que quiere.
2. **El cajero cambia el precio a mano sin permiso propio**: valorar un permiso específico y dejar registro de quién lo cambió.
3. **Un solo refresh token por usuario** (`refresh_token:<userId>`): iniciar sesión en la web cierra la del móvil. Valorar una sesión por dispositivo.
4. **El Administrador por defecto recibe casi todos los permisos** (fijado en un test; pendiente de decisión).
5. **`clientRequestId` obligatorio:** falta fijar el criterio (p. ej. versión mínima de app exigida) antes de volverlo obligatorio.
