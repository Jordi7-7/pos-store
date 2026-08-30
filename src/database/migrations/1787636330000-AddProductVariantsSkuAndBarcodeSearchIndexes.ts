import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVariantsSkuAndBarcodeSearchIndexes1787636330000 implements MigrationInterface {
  name = 'AddProductVariantsSkuAndBarcodeSearchIndexes1787636330000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old unique indexes if they exist
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_tenant_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_tenant_barcode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variants_tenant_sku"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variants_tenant_barcode"`);

    // 1. Índice ÚNICO para SKU (evita duplicados por tenant, ignora soft deletes)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_product_variants_tenant_sku" 
      ON "product_variants" ("tenant_id", "sku") 
      WHERE "deleted_at" IS NULL
    `);

    // 2. Índice ESTÁNDAR para Barcode (acelera búsquedas y permite repetidos)
    await queryRunner.query(`
      CREATE INDEX "idx_product_variants_tenant_barcode" 
      ON "product_variants" ("tenant_id", "barcode") 
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variants_tenant_barcode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_product_variants_tenant_sku"`);

    // Restore old unique indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_variants_tenant_sku" 
      ON "product_variants" ("tenant_id", "sku") 
      WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_product_variants_tenant_barcode" 
      ON "product_variants" ("tenant_id", "barcode") 
      WHERE "deleted_at" IS NULL
    `);
  }
}
