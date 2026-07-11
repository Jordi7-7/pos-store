import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionToProductImages1719878412000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images" ADD COLUMN "description" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images" DROP COLUMN "description"
    `);
  }
}
