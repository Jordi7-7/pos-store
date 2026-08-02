import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeVariantSkuAndBarcodeUniquePerTenant1719878413000 implements MigrationInterface {
  name = 'MakeVariantSkuAndBarcodeUniquePerTenant1719878413000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add tenant_id column as nullable initially
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      ADD COLUMN "tenant_id" uuid
    `);

    // 2. Add foreign key to tenants table
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      ADD CONSTRAINT "FK_product_variants_tenant" 
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
    `);

    // 3. Backfill tenant_id from parent products
    await queryRunner.query(`
      UPDATE "product_variants" pv
      SET "tenant_id" = p.tenant_id
      FROM "products" p
      WHERE pv.product_id = p.id
    `);

    // 4. Alter tenant_id column to be NOT NULL now that it is backfilled
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      ALTER COLUMN "tenant_id" SET NOT NULL
    `);

    // 5. Drop old global uniqueness constraints
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      DROP CONSTRAINT IF EXISTS "UQ_product_variants_sku"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      DROP CONSTRAINT IF EXISTS "UQ_product_variants_barcode"
    `);

    // 6. Create new partial unique indexes (tenant_id + sku/barcode) filtering out soft-deleted rows
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop new partial unique indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_tenant_barcode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_variants_tenant_sku"`);

    // 2. Restore old global unique constraints (might fail if duplicate SKUs exist across tenants, but that's standard rollback behavior)
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      ADD CONSTRAINT "UQ_product_variants_barcode" UNIQUE ("barcode")
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      ADD CONSTRAINT "UQ_product_variants_sku" UNIQUE ("sku")
    `);

    // 3. Remove FK and Column
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      DROP CONSTRAINT "FK_product_variants_tenant"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      DROP COLUMN "tenant_id"
    `);
  }
}
