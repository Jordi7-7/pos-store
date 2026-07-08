import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniquenessAndTenantConstraints1719878406000 implements MigrationInterface {
  name = 'AddUniquenessAndTenantConstraints1719878406000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Customers: Drop old index without soft-delete filter, create new one with filter
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customers_tenant_identity"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_customers_tenant_identity" 
      ON "customers" ("tenant_id", "identity_number") 
      WHERE "deleted_at" IS NULL
    `);

    // 2. Suppliers: Drop index from previous migration and create new one named UQ_suppliers_tenant_identity
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_suppliers_tenant_identity"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_suppliers_tenant_identity" 
      ON "suppliers" ("tenant_id", "identity_number") 
      WHERE "deleted_at" IS NULL
    `);

    // 3. Product Stocks: Drop old unique index and add unique constraint UQ_product_stocks_branch_variant
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_stocks_branch_variant"`);
    await queryRunner.query(`
      ALTER TABLE "product_stocks" 
      ADD CONSTRAINT "UQ_product_stocks_branch_variant" 
      UNIQUE ("branch_id", "variant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 3. Revert Product Stocks: Drop unique constraint, recreate unique index
    await queryRunner.query(`
      ALTER TABLE "product_stocks" 
      DROP CONSTRAINT IF EXISTS "UQ_product_stocks_branch_variant"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_stocks_branch_variant" 
      ON "product_stocks" ("branch_id", "variant_id")
    `);

    // 2. Revert Suppliers: Drop new UQ index, recreate old IDX index
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_suppliers_tenant_identity"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_suppliers_tenant_identity" 
      ON "suppliers" ("tenant_id", "identity_number") 
      WHERE "deleted_at" IS NULL
    `);

    // 1. Revert Customers: Drop UQ index with soft-delete filter, recreate old IDX index without filter
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_customers_tenant_identity"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_customers_tenant_identity" 
      ON "customers" ("tenant_id", "identity_number")
    `);
  }
}
