import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegacyImageUrlFromProductVariants1719878414000 implements MigrationInterface {
  name = 'DropLegacyImageUrlFromProductVariants1719878414000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      DROP COLUMN IF EXISTS "image_url"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants" 
      ADD COLUMN "image_url" character varying
    `);
  }
}
