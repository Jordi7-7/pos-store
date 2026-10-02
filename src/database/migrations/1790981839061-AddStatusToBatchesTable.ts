import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusToBatchesTable1790981839061 implements MigrationInterface {
  name = 'AddStatusToBatchesTable1790981839061';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add status column to batches table with default 'ACTIVE'
    await queryRunner.query(`
      ALTER TABLE "batches" 
      ADD COLUMN "status" varchar(50) NOT NULL DEFAULT 'ACTIVE'
    `);

    // 2. Mark batches linked to CANCELLED purchase orders as 'CANCELLED'
    await queryRunner.query(`
      UPDATE "batches" b
      SET "status" = 'CANCELLED'
      FROM "purchase_orders" po
      WHERE b.purchase_order_id = po.id
        AND po.status = 'CANCELLED'
    `);

    // 3. Mark batches where all remaining quantities are 0 (and not cancelled) as 'DEPLETED'
    await queryRunner.query(`
      UPDATE "batches" b
      SET "status" = 'DEPLETED'
      WHERE b.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "product_batches" pb WHERE pb.batch_id = b.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM "product_batches" pb WHERE pb.batch_id = b.id AND pb.remaining_quantity > 0
        )
    `);

    // 4. Create index on status
    await queryRunner.query(`
      CREATE INDEX "IDX_batches_tenant_status" ON "batches" ("tenant_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_batches_tenant_status"`);
    await queryRunner.query(`ALTER TABLE "batches" DROP COLUMN IF EXISTS "status"`);
  }
}
