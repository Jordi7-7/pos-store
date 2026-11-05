import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identificador de idempotencia de la venta: lo genera la aplicación cliente en cada intento de cobro.
 * Si el mismo identificador llega otra vez (reintento por un corte de red), no se registra una segunda venta.
 * Es opcional: las ventas sin identificador no participan del índice.
 */
export class AddClientRequestIdToSales1793400000000 implements MigrationInterface {
  name = 'AddClientRequestIdToSales1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "client_request_id" character varying(64)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_sales_tenant_client_request" ON "sales" ("tenant_id", "client_request_id") WHERE "client_request_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sales_tenant_client_request"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "client_request_id"`);
  }
}
