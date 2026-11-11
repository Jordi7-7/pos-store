import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Número provisional de las ventas hechas sin conexión: el comprobante impreso lleva ese número y, al sincronizar,
 * el servidor asigna el folio definitivo y conserva el provisional para poder buscar la venta con cualquiera de los dos.
 * Es opcional y solo añade una columna: las ventas existentes y los clientes actuales no cambian.
 */
export class AddOfflineReferenceToSales1793800000000 implements MigrationInterface {
  name = 'AddOfflineReferenceToSales1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "offline_reference" character varying(40)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_sales_tenant_offline_reference" ON "sales" ("tenant_id", "offline_reference") WHERE "offline_reference" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_sales_tenant_offline_reference"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "offline_reference"`);
  }
}
