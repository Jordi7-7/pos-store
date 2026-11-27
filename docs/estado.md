# Estado del backend

**Esto caduca.** Es una foto con fechas, no una regla; contrástala con `git log` / `git status`. Las reglas viven en `../CLAUDE.md` y `../architecture_guide.md`. Historia y porqué de las decisiones: `project-history.md`. Última revisión: 2026-11-22.

## Cifras medidas
| Comprobación | Resultado | Fecha |
|---|---|---|
| `pnpm test` (unitarios) | 516 en verde, 80 suites | 2026-11-26 |
| `pnpm test:integration` | 559 en verde, 39 suites (Postgres y Redis reales); `web-auth-flow` › logout y `http-flow` (`ECONNRESET` bajo carga) son intermitentes | 2026-11-25 |
| `scripts/reconcile-inventory.sql` (base de desarrollo) | documentos y contadores coherentes; cadena de saldos del kardex sin anomalías; **7 de 7.502** filas de existencia no cuadran con las capas FIFO (ver abajo) | 2026-11-24 |
| Supresiones de lint (`eslint-suppressions.json`) | 125 (empezó en 538) | 2026-11-26 |

Si una cifra baja o las supresiones suben, algo se rompió.

## Dónde está
- Refactor del backend **terminado y desplegado** (según el dueño, 2026-11-09). La web y el móvil ya se probaron contra este backend.
- **Offline (solo ventas, móvil):** `POST /sales/offline`, `GET /products/pos/catalog` y `GET /products/pos/stock?branchId=` hechos y commiteados (2026-11-11). Detalle en `deployment.md`.
- **Documentos de inventario y kardex completo:** entradas, salidas, conteos y traslados, con las migraciones `1794…` (comiteado el 2026-11-24).
- **Filtro de existencias del listado de productos:** `GET /products?stockStatus=IN_STOCK|ZERO|NEGATIVE`, resuelto en SQL (`stock-status-filter.ts`). El parámetro antiguo `inStockOnly` se mantiene como alias de `IN_STOCK` hasta que no quede una web que lo envíe.

## Hecho el 2026-11-25
- **Lista de documentos de inventario:** `GET /products/inventory-documents` (una fila por documento, con totales; filtros de sucursal, tipo, fechas y búsqueda por número, comentario o SKU). Los documentos y el kardex siguen abriéndose aunque el producto o la sucursal se borren después (`withDeleted` **antes** de los joins).
- **Tres hallazgos de seguridad cerrados** (cada uno con su test): cerrar un turno exige tener la caja asignada; `create-variant` rechaza existencias en sucursales de otra tienda; el panel solo suma las sucursales que el usuario puede ver (403 si pide una ajena).
- **Productos con variantes más estrictos:** precios y existencias ≥ 0, máximo 500 variantes por producto, todas las variantes del producto usan los mismos atributos (`VARIANT_ATTRIBUTES_INCONSISTENT`) y `SKU_TAKEN` nombra los SKU repetidos (`details.skus`). Los códigos de barras **siguen pudiendo repetirse** (decisión previa, índice no único).
- **Borrado de atributos y opciones:** `DELETE /products/attributes/:id` y `/products/attributes/values/:id` (permiso `attributes.delete`); se rechaza con `ATTRIBUTE_IN_USE` (dice cuántas variantes) si alguna variante vigente los usa; las variantes eliminadas no cuentan. Los DTO de **editar** variante y producto simple ya rechazan precios negativos.
- **Revisión de arquitectura del backend (2026-11-26), hecho:** (1) nombres únicos de categoría, atributo, opción y rol con índice parcial (migración `1794400000000`, **pendiente de aplicar en producción**; antes solo los comprobaba el código y el del rol ni siquiera existía en la base) y las violaciones se traducen al error de negocio; (2) `ProductImage` ya no lee `process.env` ni se vuelve a guardar con el dominio delante: usa `common/storage/public-url` (en la base solo la clave) y `register-image`/`upload-image-by-url` devuelven la misma dirección que las lecturas; (3) la importación por variantes ya no instancia handlers: usa los servicios de alta de producto; (4) la comprobación «la sucursal es de la tienda» vive en `branches/application/services/branch-lookup` en vez de 13 copias; (5) quitados los 2 `as any` de `create-variant`/`create-simple-product`. (6) los servicios `createSimpleProduct`, `createVariableProduct` y `createInventoryDocument` declaran su propia entrada y ya no conocen commands; `architecture.spec.ts` vigila esa regla y que nada en `application` importe un handler (reglas escritas en `architecture_guide.md` §2, «Dónde va cada cosa»). **Pendiente de esa revisión:** comandos que devuelven entidades (16), handlers de más de 60 líneas (27), comandos con más de 6 parámetros posicionales (21), dividir `products.controller`, `process.env` en `app.module`/`app.setup`.
- **Importación por variantes con 5 atributos por fila** (2026-11-26; antes 4), para productos como la mochila de cuatro piezas y cierre. Desplegar el backend antes que la web.
- **Orden de las opciones de un atributo:** columna `attribute_values.sort_order` (migración `1794300000000`, **pendiente de aplicar en producción**), `GET /products/attributes` las devuelve ordenadas y `PUT /products/attributes/:id/values/order` fija el orden (exige la lista completa; `ATTRIBUTE_ORDER_STALE` si cambió). Las opciones nuevas, a mano o por importación, van al final. El test de migraciones de proveedores ya no depende de cuántas migraciones hay después de la suya.
- **Importación por variantes:** `POST /products/import-variants` (una fila por variante; `dryRun` valida y cuenta sin escribir; informe de errores por fila; crea categorías, atributos y valores que falten y todo en una transacción). Planificador puro en `domain/import-plan.ts`. Máximo 2.000 filas. Reutiliza los casos de uso de alta, así que valida igual que la pantalla. El importador antiguo de productos simples (`/products/import`) sigue como estaba.

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
- **Hallazgos de seguridad de la auditoría:** los tres se corrigieron el 2026-11-25 (ver «Hecho el 2026-11-25»).
- **Migración `1794100000000`:** da conteo y traslado a todo rol que tenía «ajustar stock» (capacidades nuevas). El dueño indicó el 2026-11-25 que ya está aplicada en producción, así que no hay nada que decidir sobre la migración (una migración aplicada no se edita); solo queda revisar qué roles recibieron esos permisos.
- **Permiso `action:products.adjust_stock`:** retirado el 2026-11-25 del catálogo, de los roles por defecto y de las constantes de la web y el móvil; la migración `1794200000000` lo quita de los roles y usuarios guardados (**pendiente de aplicar en producción**: va tras desplegar este cambio).
- **Test intermitente:** `web-auth-flow` › «logout: revoca la sesión aunque el token de acceso haya vencido» falló 2 de ~12 ejecuciones (esperaba 401 y recibió 404 en `/auth/web/refresh`); no se reprodujo en 8 repeticiones seguidas con el cuerpo de la respuesta a la vista. El módulo de autenticación no se tocó en esos cambios.

## Decisiones de negocio por confirmar con el dueño (revisión del 2026-11-22; el código no se ha cambiado)
No las cambies por tu cuenta; si trabajas cerca, plantéaselas.
1. **Devolución de una venta con tarjeta resta efectivo de la caja** («decisión actual» en `../CLAUDE.md`): parece descuadrar el arqueo; confirmar si es lo que quiere.
2. **El cajero cambia el precio a mano sin permiso propio**: valorar un permiso específico y dejar registro de quién lo cambió.
3. **Un solo refresh token por usuario** (`refresh_token:<userId>`): iniciar sesión en la web cierra la del móvil. Valorar una sesión por dispositivo.
4. **El Administrador por defecto recibe casi todos los permisos** (fijado en un test; pendiente de decisión).
5. **`clientRequestId` obligatorio:** falta fijar el criterio (p. ej. versión mínima de app exigida) antes de volverlo obligatorio.
