import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { databaseConnectionOptions } from '../../src/config/database.options';

/**
 * Comprueba la migración de índices contra Postgres: se aplica, se revierte y las consultas
 * calientes pueden usar los índices. Crea y borra su propia base de datos.
 */
describe('Índices de consulta', () => {
  const databaseName = `pos_store_it_idx_${process.pid}_${Date.now()}`;
  let admin: DataSource;
  let db: DataSource;

  const indexNames = async (): Promise<string[]> =>
    (await db.query<Array<{ indexname: string }>>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'IDX\\_%'`)).map(
      (row) => row.indexname,
    );

  /** Plan de la consulta con los escaneos secuenciales desactivados: muestra si el índice es utilizable. */
  const planOf = async (sql: string, params: unknown[]): Promise<string> => {
    const runner = db.createQueryRunner();
    try {
      await runner.query('SET enable_seqscan = off');
      const rows = (await runner.query(`EXPLAIN ${sql}`, params)) as Array<{ 'QUERY PLAN': string }>;
      return rows.map((row) => row['QUERY PLAN']).join('\n');
    } finally {
      await runner.query('RESET enable_seqscan');
      await runner.release();
    }
  };

  const ID = '00000000-0000-4000-8000-000000000000';

  beforeAll(async () => {
    dotenv.config();
    admin = await new DataSource({ ...databaseConnectionOptions(), database: 'postgres', entities: [] }).initialize();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    db = await new DataSource({
      ...databaseConnectionOptions(),
      database: databaseName,
      migrations: [path.join(__dirname, '../../src/database/migrations/*.ts')],
    }).initialize();
    await db.runMigrations();
  }, 60000);

  afterAll(async () => {
    await db?.destroy();
    await admin?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin?.destroy();
  });

  it('la migración crea los índices y se puede revertir y volver a aplicar', async () => {
    const created = await indexNames();
    expect(created).toEqual(expect.arrayContaining(['IDX_sales_tenant_created_at', 'IDX_sale_items_sale', 'IDX_product_batches_fifo_available']));

    await db.undoLastMigration();
    const afterUndo = await indexNames();
    expect(afterUndo).not.toContain('IDX_sales_tenant_created_at');
    expect(afterUndo).not.toContain('IDX_product_batches_fifo_available');

    await db.runMigrations();
    expect(await indexNames()).toEqual(expect.arrayContaining(created));
  });

  it.each([
    ['ventas por rango de fechas del tenant', `SELECT * FROM sales WHERE tenant_id = $1 AND created_at BETWEEN now() - interval '1 day' AND now()`, 'IDX_sales_tenant_created_at'],
    ['ventas de una sesión de caja', `SELECT * FROM sales WHERE cash_session_id = $1`, 'IDX_sales_cash_session'],
    ['ítems de una venta', `SELECT * FROM sale_items WHERE sale_id = $1`, 'IDX_sale_items_sale'],
    ['pagos de una venta', `SELECT * FROM sale_payments WHERE sale_id = $1`, 'IDX_sale_payments_sale'],
    ['devoluciones de una sesión', `SELECT * FROM refunds WHERE cash_session_id = $1`, 'IDX_refunds_cash_session'],
    ['devoluciones de una venta', `SELECT * FROM refunds WHERE sale_id = $1`, 'IDX_refunds_sale'],
    ['gastos de una sesión', `SELECT * FROM expenses WHERE cash_session_id = $1`, 'IDX_expenses_cash_session'],
    ['variantes de un producto', `SELECT * FROM product_variants WHERE product_id = $1`, 'IDX_product_variants_product'],
    ['stock de una variante en todas las sucursales', `SELECT * FROM product_stocks WHERE variant_id = $1`, 'IDX_product_stocks_variant'],
    [
      'consumo FIFO de lotes con unidades',
      `SELECT * FROM product_batches WHERE branch_id = $1 AND variant_id = $1 AND remaining_quantity > 0 ORDER BY created_at ASC`,
      'IDX_product_batches_fifo_available',
    ],
    [
      'movimientos de una variante, los más recientes primero',
      `SELECT * FROM inventory_movements WHERE tenant_id = $1 AND variant_id = $1 ORDER BY created_at DESC LIMIT 10`,
      'IDX_inventory_movements_tenant_variant_created_at',
    ],
    ['ítems de una orden de compra', `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`, 'IDX_purchase_order_items_order'],
  ])('%s puede usar su índice', async (_label, sql, expectedIndex) => {
    expect(await planOf(sql, [ID])).toContain(expectedIndex);
  });
});
