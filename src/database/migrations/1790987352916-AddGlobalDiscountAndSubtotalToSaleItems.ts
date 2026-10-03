import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGlobalDiscountAndSubtotalToSaleItems1790987352916 implements MigrationInterface {
  name = 'AddGlobalDiscountAndSubtotalToSaleItems1790987352916';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add global_discount_amount and subtotal columns to sale_items
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD COLUMN "global_discount_amount" numeric(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN "subtotal" numeric(10,2) NOT NULL DEFAULT 0
    `);

    // 2. Backfill existing sale_items subtotal and prorated global_discount_amount
    await queryRunner.query(`
      WITH sale_weights AS (
        SELECT 
          si.id AS item_id,
          si.sale_id,
          (si.price * si.quantity - COALESCE(si.discount_amount, 0)) AS item_base,
          SUM(si.price * si.quantity - COALESCE(si.discount_amount, 0)) OVER (PARTITION BY si.sale_id) AS total_base,
          COALESCE(s.discount_amount, 0) AS sale_global_discount
        FROM "sale_items" si
        JOIN "sales" s ON s.id = si.sale_id
      )
      UPDATE "sale_items" si
      SET 
        "global_discount_amount" = CASE 
          WHEN sw.total_base > 0 AND sw.sale_global_discount > 0 
          THEN ROUND((sw.item_base / sw.total_base) * sw.sale_global_discount, 2)
          ELSE 0 
        END,
        "subtotal" = ROUND(
          (si.price * si.quantity - COALESCE(si.discount_amount, 0)) - 
          CASE 
            WHEN sw.total_base > 0 AND sw.sale_global_discount > 0 
            THEN ROUND((sw.item_base / sw.total_base) * sw.sale_global_discount, 2)
            ELSE 0 
          END, 
          2
        )
      FROM sale_weights sw
      WHERE si.id = sw.item_id
    `);

    // 3. Clean up any historical discount_type and discount_rate where discount_amount = 0
    await queryRunner.query(`
      UPDATE "sales"
      SET 
        "discount_type" = NULL,
        "discount_rate" = NULL,
        "discount_amount" = 0
      WHERE "discount_amount" = 0 OR "discount_amount" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "sale_items"
      SET 
        "discount_type" = NULL,
        "discount_rate" = NULL,
        "discount_amount" = 0
      WHERE "discount_amount" = 0 OR "discount_amount" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "subtotal"`);
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "global_discount_amount"`);
  }
}
