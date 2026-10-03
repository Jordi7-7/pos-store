import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotalAndRefactorSubtotalInSaleItems1790988295259 implements MigrationInterface {
  name = 'AddTotalAndRefactorSubtotalInSaleItems1790988295259';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add total column to sale_items
    await queryRunner.query(`
      ALTER TABLE "sale_items"
      ADD COLUMN "total" numeric(10,2) NOT NULL DEFAULT 0
    `);

    // 2. Set subtotal = (quantity * price) [bruto sin descuentos]
    //    Set total = subtotal - discount_amount - global_discount_amount [neto final]
    await queryRunner.query(`
      UPDATE "sale_items"
      SET 
        "subtotal" = ROUND(quantity * price, 2),
        "total" = ROUND((quantity * price) - COALESCE(discount_amount, 0) - COALESCE(global_discount_amount, 0), 2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "total"`);
  }
}
