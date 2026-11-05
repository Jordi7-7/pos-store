import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices para las rutas calientes. PostgreSQL no indexa las claves foráneas por sí solo y
 * estas tablas solo tenían la clave primaria, de modo que cada join y cada filtro por sesión
 * de caja, venta, variante o fecha recorría la tabla completa.
 *
 * Cada índice corresponde a una consulta real:
 *  - sales(tenant_id, created_at): dashboard, reportes y listado paginado por rango de fechas.
 *  - sales(cash_session_id), refunds/expenses(cash_session_id): detalle, cierre y listado de sesiones.
 *  - sale_items/sale_payments/refund_items (FK a su cabecera): carga de las líneas de cada venta.
 *  - sale_items(variant_id): "ventas por variante" y reportes de producto.
 *  - product_batches parcial: consumo FIFO; solo indexa lotes con unidades restantes, así no
 *    crece con el historial de lotes agotados.
 *  - product_variants(product_id), product_stocks(variant_id): catálogo y suma de stock por variante.
 *
 * Se crean con CREATE INDEX normal (dentro de la transacción de migraciones): bloquea las
 * escrituras de cada tabla solo mientras se construye el índice. Ejecútala en un momento de
 * poca actividad. Es idempotente (IF NOT EXISTS).
 */
const INDEXES: ReadonlyArray<{ name: string; table: string; definition: string }> = [
  { name: 'IDX_sales_tenant_created_at', table: 'sales', definition: '("tenant_id", "created_at" DESC)' },
  { name: 'IDX_sales_cash_session', table: 'sales', definition: '("cash_session_id")' },
  { name: 'IDX_sale_items_sale', table: 'sale_items', definition: '("sale_id")' },
  { name: 'IDX_sale_items_variant', table: 'sale_items', definition: '("variant_id")' },
  { name: 'IDX_sale_payments_sale', table: 'sale_payments', definition: '("sale_id")' },
  { name: 'IDX_refunds_tenant_created_at', table: 'refunds', definition: '("tenant_id", "created_at" DESC)' },
  { name: 'IDX_refunds_cash_session', table: 'refunds', definition: '("cash_session_id")' },
  { name: 'IDX_refunds_sale', table: 'refunds', definition: '("sale_id")' },
  { name: 'IDX_refund_items_refund', table: 'refund_items', definition: '("refund_id")' },
  { name: 'IDX_expenses_cash_session', table: 'expenses', definition: '("cash_session_id")' },
  { name: 'IDX_cash_sessions_branch_opened_at', table: 'cash_sessions', definition: '("branch_id", "opened_at" DESC)' },
  {
    name: 'IDX_inventory_movements_tenant_variant_created_at',
    table: 'inventory_movements',
    definition: '("tenant_id", "variant_id", "created_at" DESC)',
  },
  { name: 'IDX_purchase_orders_tenant_created_at', table: 'purchase_orders', definition: '("tenant_id", "created_at" DESC)' },
  { name: 'IDX_purchase_orders_supplier', table: 'purchase_orders', definition: '("supplier_id")' },
  { name: 'IDX_purchase_order_items_order', table: 'purchase_order_items', definition: '("purchase_order_id")' },
  { name: 'IDX_purchase_order_items_variant', table: 'purchase_order_items', definition: '("variant_id")' },
  { name: 'IDX_product_variants_product', table: 'product_variants', definition: '("product_id")' },
  { name: 'IDX_product_stocks_variant', table: 'product_stocks', definition: '("variant_id")' },
  {
    name: 'IDX_product_batches_fifo_available',
    table: 'product_batches',
    definition: '("branch_id", "variant_id", "created_at") WHERE "remaining_quantity" > 0',
  },
];

export class AddQueryAndForeignKeyIndexes1793000000000 implements MigrationInterface {
  name = 'AddQueryAndForeignKeyIndexes1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { name, table, definition } of INDEXES) {
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" ${definition}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { name } of [...INDEXES].reverse()) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${name}"`);
    }
  }
}
