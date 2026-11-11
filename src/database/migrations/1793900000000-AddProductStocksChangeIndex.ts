import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índice para descargar las existencias de una sucursal por cambios (`GET /products/pos/stock`): recorre las filas de
 * la sucursal en orden de modificación sin ordenar toda la tabla en cada página. Solo añade un índice.
 */
export class AddProductStocksChangeIndex1793900000000 implements MigrationInterface {
  name = 'AddProductStocksChangeIndex1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_product_stocks_branch_changed" ON "product_stocks" ("branch_id", "updated_at", "variant_id") WHERE "deleted_at" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_stocks_branch_changed"`);
  }
}
