import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypeAndBaseSkuToProducts1791890000000 implements MigrationInterface {
  name = 'AddTypeAndBaseSkuToProducts1791890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum type if not exists
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."products_type_enum" AS ENUM('SIMPLE', 'VARIABLE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`
    );

    // 2. Add columns 'type' and 'base_sku'
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "type" "public"."products_type_enum" NOT NULL DEFAULT 'SIMPLE'`
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "base_sku" character varying`
    );

    // 3. Add index on tenant_id and type for fast filtering
    await queryRunner.query(
      `CREATE INDEX "IDX_products_tenant_type" ON "products" ("tenant_id", "type")`
    );
    await queryRunner.query(
      `CREATE INDEX "idx_products_tenant_base_sku" ON "products" ("tenant_id", "base_sku") WHERE "deleted_at" IS NULL`
    );

    // 4. Update existing products that already have multiple variants to 'VARIABLE'
    await queryRunner.query(
      `UPDATE "products" p
       SET "type" = 'VARIABLE'
       WHERE (
         SELECT COUNT(*) FROM "product_variants" pv WHERE pv."product_id" = p."id"
       ) > 1`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_products_tenant_type"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "base_sku"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE "public"."products_type_enum"`);
  }
}
