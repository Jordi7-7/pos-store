import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemsAndGlobalDiscountAmountToSales1790989997006 implements MigrationInterface {
  name = 'AddItemsAndGlobalDiscountAmountToSales1790989997006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add items_discount_amount and global_discount_amount to sales
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN "items_discount_amount" numeric(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN "global_discount_amount" numeric(10,2) NOT NULL DEFAULT 0
    `);

    // 2. Backfill existing sales:
    //    - global_discount_amount comes from the previous discount_amount (which was only global)
    //    - items_discount_amount is calculated from SUM(si.discount_amount)
    //    - subtotal is recalculated as SUM(si.subtotal) = SUM(si.quantity * si.price) [bruto de lista]
    //    - discount_amount is updated to items_discount_amount + global_discount_amount
    await queryRunner.query(`
      WITH items_agg AS (
        SELECT 
          si.sale_id,
          COALESCE(SUM(si.subtotal), 0) AS total_gross_subtotal,
          COALESCE(SUM(si.discount_amount), 0) AS total_items_discount
        FROM "sale_items" si
        GROUP BY si.sale_id
      )
      UPDATE "sales" s
      SET 
        "items_discount_amount" = ROUND(COALESCE(ia.total_items_discount, 0), 2),
        "global_discount_amount" = ROUND(COALESCE(s.discount_amount, 0), 2),
        "subtotal" = ROUND(COALESCE(ia.total_gross_subtotal, s.subtotal), 2),
        "discount_amount" = ROUND(COALESCE(ia.total_items_discount, 0) + COALESCE(s.discount_amount, 0), 2)
      FROM items_agg ia
      WHERE s.id = ia.sale_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "global_discount_amount"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "items_discount_amount"`);
  }
}
