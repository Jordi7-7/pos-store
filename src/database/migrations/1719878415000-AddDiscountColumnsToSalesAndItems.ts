import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscountColumnsToSalesAndItems1719878415000 implements MigrationInterface {
  name = 'AddDiscountColumnsToSalesAndItems1719878415000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns to sales table
    await queryRunner.query(`
      ALTER TABLE "sales" 
      ADD COLUMN "discount_type" character varying,
      ADD COLUMN "discount_rate" numeric(10,2),
      ADD COLUMN "discount_amount" numeric(10,2) NOT NULL DEFAULT 0
    `);

    // Add columns to sale_items table
    await queryRunner.query(`
      ALTER TABLE "sale_items" 
      ADD COLUMN "discount_type" character varying,
      ADD COLUMN "discount_rate" numeric(10,2),
      ADD COLUMN "discount_amount" numeric(10,2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop columns from sale_items table
    await queryRunner.query(`
      ALTER TABLE "sale_items" 
      DROP COLUMN "discount_amount",
      DROP COLUMN "discount_rate",
      DROP COLUMN "discount_type"
    `);

    // Drop columns from sales table
    await queryRunner.query(`
      ALTER TABLE "sales" 
      DROP COLUMN "discount_amount",
      DROP COLUMN "discount_rate",
      DROP COLUMN "discount_type"
    `);
  }
}
