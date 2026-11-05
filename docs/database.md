# Base de datos

PostgreSQL 16. El esquema **solo cambia por migraciones** (`synchronize` está desactivado). Las entidades TypeORM están en `src/modules/*/domain/entities/` y las migraciones en `src/database/migrations/` (`<timestamp>-Nombre.ts`, ~50). Para el orden y el riesgo de desplegarlas, ver `docs/deployment.md`.

## Convenciones del esquema

- **Claves:** `id uuid`. **Fechas:** `timestamptz` (`created_at`, `updated_at`) y **borrado lógico** con `deleted_at` (la mayoría de las tablas; TypeORM lo excluye solo en las consultas normales).
- **Dinero:** `numeric(10,2)`; cantidades: `numeric`. En el código se leen con `ColumnNumericTransformer` (a `number`) y **toda la aritmética de dinero usa `Money`** (`src/common/domain/money.ts`, centavos exactos, redondeo a la mitad hacia arriba), nunca `number` con coma flotante.
- **Estados y tipos son `varchar`** (por decisión del proyecto no se usan enums de Postgres): el conjunto de valores válidos vive solo en el código como `enum` de TypeScript (`SaleStatus`, `PurchaseOrderStatus`, `CashSessionStatus`, `BatchStatus`, `BatchOriginType`, `PaymentMethod`, `InventoryMovementType`, `ProductType`…). Al declarar la columna con un enum de TS hay que indicar `type: 'varchar'` explícito.
- **Multitenancy explícita:** casi todas las tablas tienen `tenant_id` y **cada consulta filtra por él**. No hay filtrado automático. Las tablas hijas **sin** `tenant_id` (`product_stocks`, `sale_items`, `sale_payments`, `refund_items`, `purchase_order_items`, `cash_sessions`, `attribute_values`) se alcanzan siempre a través de su padre ya filtrado por tienda.
- **Índices con nombre explícito** y, cuando la unicidad solo aplica a registros activos, **parciales** (`WHERE deleted_at IS NULL`), para que un registro borrado libere su valor.

## Tablas

**Tienda y acceso**
| Tabla | Para qué |
|---|---|
| `tenants` | La tienda (cliente del SaaS): RUC (único global), `slug` (único global; es lo que se escribe al iniciar sesión), moneda, zona horaria IANA, logo |
| `branches` | Sucursales de una tienda; `code` correlativo |
| `users` | Usuarios; `is_owner` (el propietario no tiene rol y lo puede todo), `role_id`, `custom_permissions`, `pin` (hash), `is_active`. `password` y `pin` tienen `select: false` |
| `roles` | Roles por tienda con su lista de `permissions`; `is_system` para los tres por defecto |
| `user_branches` | A qué sucursales puede acceder cada usuario (un usuario que no es propietario **necesita** asignación explícita) |
| `user_cash_registers` | Qué cajas puede usar cada usuario |

**Catálogo**
| Tabla | Para qué |
|---|---|
| `products` | Producto; `type` SIMPLE o VARIABLE; `base_sku` (código del producto) |
| `product_variants` | Lo que se vende: SKU, código de barras, `purchase_price` (costo promedio ponderado vigente), `sale_price`, `wholesale_price`. Un producto simple tiene exactamente una |
| `categories`, `attributes`, `attribute_values`, `variant_attribute_values` | Categorías y atributos (Color, Talla…) y su asignación a variantes |
| `product_images`, `product_image_mappings`, `product_variant_image_mappings` | Galería de la tienda y qué imagen usa cada producto/variante |
| `tags`, `variant_tags` | Etiquetas de variantes |

**Inventario**
| Tabla | Para qué |
|---|---|
| `product_stocks` | Existencias por (sucursal, variante). Puede quedar **negativa** si se vende sin stock; la siguiente entrada salda esa deuda |
| `batches` | Cabecera de un lote físico: origen `PURCHASE`, `INITIAL_STOCK`, `REFUND` o `ADJUSTMENT`, y estado (`ACTIVE`/`DEPLETED`/`CANCELLED`) |
| `product_batches` | Capas **FIFO** por variante y sucursal: `initial_quantity`, `remaining_quantity`, `unit_cost`. De aquí sale el costo de cada venta |
| `inventory_movements` | Kardex: entradas y salidas con su motivo (`COMPRA`, `VENTA`, `ANULACION_COMPRA`, ajustes…) |

**Compras**
| Tabla | Para qué |
|---|---|
| `suppliers` | Proveedores; existe uno `GENERICO` por tienda |
| `purchase_orders`, `purchase_order_items` | Compras (estado `COMPLETED`/`CANCELLED`) y sus líneas |

**Ventas y caja**
| Tabla | Para qué |
|---|---|
| `customers` | Clientes; existe siempre el **CONSUMIDOR FINAL** (documento `9999999999999`), comprador por defecto, intocable |
| `cash_registers` | Cajas por sucursal; `next_invoice_number` (la fila se bloquea al numerar facturas) |
| `cash_sessions` | Turnos de caja (`OPEN`/`CLOSED`), saldo de apertura/cierre, `expected_balance`, `difference` |
| `sales`, `sale_items`, `sale_payments` | Ventas, sus líneas (con costo FIFO y descuentos prorrateados) y sus pagos (`EFECTIVO`/`TARJETA`). `invoice_number` formato `SSS-CCC-NNNNNNNNN`; `client_request_id` para idempotencia |
| `refunds`, `refund_items` | Devoluciones (restan efectivo de la caja del turno en que se hacen) |
| `expenses` | Gastos de caja |

`migrations` es la tabla de control de TypeORM.

## Restricciones únicas importantes

| Tabla | Índice | Regla |
|---|---|---|
| `tenants` | `UQ_3d357209…` (`ruc`), `UQ_tenants_slug` | RUC y slug únicos globalmente |
| `users` | `UQ_users_tenant_email`, `UQ_users_tenant_username` | Único **por tienda**, entre usuarios no borrados. El mismo correo puede administrar varias tiendas |
| `customers` | `UQ_customers_tenant_identity` | Documento único por tienda entre clientes activos |
| `suppliers` | `UQ_suppliers_tenant_identity` | Ídem para proveedores |
| `products` | `UQ_products_tenant_base_sku_ci` | `(tenant_id, UPPER(base_sku))` activos: el SKU base es único sin distinguir mayúsculas |
| `product_variants` | `idx_product_variants_tenant_sku` | `(tenant_id, sku)` activos. Los SKU se guardan **en MAYÚSCULAS y recortados** (`normalizeSku`) |
| `product_stocks` | `(branch_id, variant_id)` | Una fila por sucursal y variante |
| `cash_registers` | `IDX_cash_registers_tenant_branch_code` | Código de caja único por sucursal |
| `cash_sessions` | `UQ_cash_sessions_open_per_register` | **Una sola sesión abierta por caja** |
| `sales` | `IDX_sales_tenant_invoice_number` | Folio único por tienda |
| `sales` | `UQ_sales_tenant_client_request` | `(tenant_id, client_request_id)` cuando no es nulo: impide duplicar una venta reintentada |

Los traductores de violaciones únicas a errores de negocio están en `src/common/errors/database-errors.ts` (`isUniqueViolation`) y `src/modules/products/application/services/sku-conflict.ts` (`translatingSkuConflict`).

## Concurrencia: cómo se evitan las carreras

La mayoría de los defectos reales encontrados en este proyecto fueron carreras (dos peticiones que pasan una comprobación a la vez). Patrones en uso:

- **Bloquear siempre en el mismo orden.** Las filas de stock se bloquean ordenadas por `variantId` (`lockBranchStock` / `consumeStock` / `receiveStock` en `src/modules/products/application/services/inventory-stock.ts`); dos ventas o compras con los mismos productos en orden distinto causaban *deadlocks*.
- **Upsert y luego bloqueo** de `product_stocks` (no se puede bloquear una fila que aún no existe).
- **Turno de caja:** `lockCashSession` (`FOR UPDATE` para cerrar, `FOR SHARE` para vender/devolver/gastar) → el cierre calcula el arqueo sin ventas en curso.
- **Numeración de facturas:** bloqueo pesimista de la fila de `cash_registers` (`reserveInvoiceNumber`).
- **Orden de compra:** `FOR UPDATE` al cancelar (dos cancelaciones no revierten dos veces) y bloqueo del stock **antes** de leer los lotes.
- **Bloqueos consultivos** (`pg_advisory_xact_lock(hashtext(clave))`) donde no hay índice único que lo serialice: altas de sucursales (por tienda), de cajas (por sucursal) y de etiquetas (por nombre).
- **Índices únicos como red de seguridad** y traducción de su violación a un error de negocio (nunca dejar escapar el error crudo de Postgres).
- **Efectos externos tras confirmar la transacción** (invalidar caché, revocar sesión), nunca dentro.

## Escribir una migración

- Nombre `<timestamp>-NombreDescriptivo.ts`, clase con `name` igual. Mantén el `down` real cuando se pueda; si no se puede revertir, **déjalo vacío con un comentario** que lo diga.
- TypeORM ejecuta **todas las migraciones pendientes en una sola transacción** (modo por defecto): no se puede usar `CREATE INDEX CONCURRENTLY` ni `transaction = false` por migración.
- Si añade una regla de unicidad sobre datos existentes, **comprueba duplicados primero y detente con un mensaje claro** (patrón de `AddUniqueSupplierIdentityPerTenant`): nunca borres ni fusiones datos a escondidas.
- **Revisa las migraciones autogeneradas:** `UpdateAllTimestampsToTimestamptz` re-creó restricciones únicas globales que ya se habían eliminado a propósito (correo de usuario, documento de cliente). Hubo que corregirlo con migraciones posteriores.
- Prueba la migración con un test de integración (ver `test/integration/*`: deshacer hasta quitar el índice, insertar datos que la rompan, comprobar el mensaje, resolver y reaplicar).
- Local: `pnpm migration:run`; ver pendientes: `pnpm typeorm migration:show -d src/config/data-source.ts`.
