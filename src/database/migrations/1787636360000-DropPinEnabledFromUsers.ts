import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropPinEnabledFromUsers1787636360000 implements MigrationInterface {
  name = 'DropPinEnabledFromUsers1787636360000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP COLUMN IF EXISTS "pin_enabled"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "pin_enabled" boolean NOT NULL DEFAULT false
    `);
  }
}
