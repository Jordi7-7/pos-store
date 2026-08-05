import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusToSalesAndRefundsTables1719878416000 implements MigrationInterface {
  name = 'AddStatusToSalesAndRefundsTables1719878416000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add status column to sales table with default COMPLETED
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'COMPLETED'
    `);

    // Create refunds table if it doesn't exist (defensive — may already exist)
    const refundsExists = await queryRunner.hasTable('refunds');
    if (!refundsExists) {
      await queryRunner.query(`
        CREATE TABLE "refunds" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "deleted_at" TIMESTAMP,
          "tenant_id" uuid NOT NULL,
          "branch_id" uuid NOT NULL,
          "sale_id" uuid NOT NULL,
          "cash_session_id" uuid NOT NULL,
          "total_refunded" numeric(10,2) NOT NULL,
          "reason" character varying NOT NULL,
          CONSTRAINT "PK_refunds" PRIMARY KEY ("id")
        )
      `);
    }

    // Create refund_items table if it doesn't exist
    const refundItemsExists = await queryRunner.hasTable('refund_items');
    if (!refundItemsExists) {
      await queryRunner.query(`
        CREATE TABLE "refund_items" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "deleted_at" TIMESTAMP,
          "refund_id" uuid NOT NULL,
          "variant_id" uuid NOT NULL,
          "quantity" numeric(10,2) NOT NULL,
          "price_refunded" numeric(10,2) NOT NULL,
          CONSTRAINT "PK_refund_items" PRIMARY KEY ("id"),
          CONSTRAINT "FK_refund_items_refund" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refunds"`);
  }
}
