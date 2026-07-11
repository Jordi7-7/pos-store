import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductBatchesTable1719878410000 implements MigrationInterface {
  name = 'CreateProductBatchesTable1719878410000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "purchase_order_id" uuid,
        "initial_quantity" numeric(10,2) NOT NULL,
        "remaining_quantity" numeric(10,2) NOT NULL,
        "unit_cost" numeric(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_batches_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_batches_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_batches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_batches_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_batches_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_batches_branch_variant" ON "product_batches" ("branch_id", "variant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_batches_remaining_qty" ON "product_batches" ("remaining_quantity")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_batches_remaining_qty"`);
    await queryRunner.query(`DROP INDEX "IDX_product_batches_branch_variant"`);
    await queryRunner.query(`DROP TABLE "product_batches"`);
  }
}
