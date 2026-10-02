import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBatchesTableAndLinkProductBatches1790979342000 implements MigrationInterface {
  name = 'CreateBatchesTableAndLinkProductBatches1790979342000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create batches table
    await queryRunner.query(`
      CREATE TABLE "batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "purchase_order_id" uuid,
        "code" varchar(100),
        "origin_type" varchar(50) NOT NULL DEFAULT 'PURCHASE',
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_batches_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_batches_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_batches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_batches_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_batches_tenant_branch" ON "batches" ("tenant_id", "branch_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_batches_purchase_order" ON "batches" ("purchase_order_id")
    `);

    // 2. Add batch_id to product_batches (nullable initially for data backfill)
    await queryRunner.query(`
      ALTER TABLE "product_batches" ADD COLUMN "batch_id" uuid
    `);

    // 3. Backfill batches from existing product_batches with purchase_order_id
    await queryRunner.query(`
      INSERT INTO "batches" ("id", "tenant_id", "branch_id", "purchase_order_id", "code", "origin_type", "created_at", "updated_at")
      SELECT 
        uuid_generate_v4(),
        pb.tenant_id,
        pb.branch_id,
        pb.purchase_order_id,
        COALESCE(po.invoice_number, CONCAT('OC-', SUBSTRING(pb.purchase_order_id::text, 1, 8))),
        'PURCHASE',
        MIN(pb.created_at),
        now()
      FROM "product_batches" pb
      LEFT JOIN "purchase_orders" po ON po.id = pb.purchase_order_id
      WHERE pb.purchase_order_id IS NOT NULL
      GROUP BY pb.tenant_id, pb.branch_id, pb.purchase_order_id, po.invoice_number
    `);

    // Link product_batches that have purchase_order_id to the created batches
    await queryRunner.query(`
      UPDATE "product_batches" pb
      SET "batch_id" = b.id
      FROM "batches" b
      WHERE pb.purchase_order_id IS NOT NULL 
        AND b.purchase_order_id = pb.purchase_order_id
        AND b.branch_id = pb.branch_id
    `);

    // 4. Backfill batches for product_batches WITHOUT purchase_order_id (Initial stocks / adjustments)
    await queryRunner.query(`
      INSERT INTO "batches" ("id", "tenant_id", "branch_id", "purchase_order_id", "code", "origin_type", "created_at", "updated_at")
      SELECT 
        uuid_generate_v4(),
        pb.tenant_id,
        pb.branch_id,
        NULL,
        CONCAT('LOT-DIR-', TO_CHAR(MIN(pb.created_at), 'YYYYMMDD-HH24MI')),
        'INITIAL_STOCK',
        MIN(pb.created_at),
        now()
      FROM "product_batches" pb
      WHERE pb.purchase_order_id IS NULL
      GROUP BY pb.tenant_id, pb.branch_id, TO_CHAR(pb.created_at, 'YYYY-MM-DD HH24:MI')
    `);

    // Link product_batches without purchase_order_id to the created direct batches
    await queryRunner.query(`
      UPDATE "product_batches" pb
      SET "batch_id" = b.id
      FROM "batches" b
      WHERE pb.purchase_order_id IS NULL 
        AND b.purchase_order_id IS NULL
        AND b.branch_id = pb.branch_id
        AND TO_CHAR(b.created_at, 'YYYY-MM-DD HH24:MI') = TO_CHAR(pb.created_at, 'YYYY-MM-DD HH24:MI')
    `);

    // Fallback: If any row remains with null batch_id, create an individual batch
    await queryRunner.query(`
      INSERT INTO "batches" ("id", "tenant_id", "branch_id", "purchase_order_id", "code", "origin_type", "created_at", "updated_at")
      SELECT 
        uuid_generate_v4(),
        pb.tenant_id,
        pb.branch_id,
        NULL,
        CONCAT('LOT-', SUBSTRING(pb.id::text, 1, 8)),
        'INITIAL_STOCK',
        pb.created_at,
        now()
      FROM "product_batches" pb
      WHERE pb.batch_id IS NULL
    `);

    await queryRunner.query(`
      UPDATE "product_batches" pb
      SET "batch_id" = b.id
      FROM "batches" b
      WHERE pb.batch_id IS NULL AND b.code = CONCAT('LOT-', SUBSTRING(pb.id::text, 1, 8))
    `);

    // 5. Enforce NOT NULL and FK on batch_id
    await queryRunner.query(`
      ALTER TABLE "product_batches" ALTER COLUMN "batch_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "product_batches" 
      ADD CONSTRAINT "FK_product_batches_batch" 
      FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_batches_batch_id" ON "product_batches" ("batch_id")
    `);

    // 6. Drop purchase_order_id FK and column from product_batches
    await queryRunner.query(`
      ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "FK_product_batches_purchase_order"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "FK_011591d355c11e2082dce47f11e"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_batches" DROP COLUMN "purchase_order_id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add purchase_order_id
    await queryRunner.query(`
      ALTER TABLE "product_batches" ADD COLUMN "purchase_order_id" uuid
    `);

    await queryRunner.query(`
      UPDATE "product_batches" pb
      SET "purchase_order_id" = b.purchase_order_id
      FROM "batches" b
      WHERE pb.batch_id = b.id
    `);

    await queryRunner.query(`
      ALTER TABLE "product_batches" 
      ADD CONSTRAINT "FK_product_batches_purchase_order" 
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_batches_batch_id"`);
    await queryRunner.query(`ALTER TABLE "product_batches" DROP CONSTRAINT IF EXISTS "FK_product_batches_batch"`);
    await queryRunner.query(`ALTER TABLE "product_batches" DROP COLUMN "batch_id"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_batches_purchase_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_batches_tenant_branch"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "batches"`);
  }
}
