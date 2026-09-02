import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsActiveToUsers1787636350000 implements MigrationInterface {
  name = 'AddIsActiveToUsers1787636350000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN IF EXISTS "is_active"
    `);
  }
}
