import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWholesalePriceToProductVariants1787636370000 implements MigrationInterface {
  name = 'AddWholesalePriceToProductVariants1787636370000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD COLUMN IF NOT EXISTS "wholesale_price" numeric(10, 2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN IF EXISTS "wholesale_price"
    `);
  }
}
