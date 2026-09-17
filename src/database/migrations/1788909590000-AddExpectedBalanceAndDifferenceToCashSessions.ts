import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpectedBalanceAndDifferenceToCashSessions1788909590000 implements MigrationInterface {
  name = 'AddExpectedBalanceAndDifferenceToCashSessions1788909590000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cash_sessions" 
      ADD COLUMN IF NOT EXISTS "expected_balance" numeric(10,2) NULL,
      ADD COLUMN IF NOT EXISTS "difference" numeric(10,2) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cash_sessions" 
      DROP COLUMN IF EXISTS "difference",
      DROP COLUMN IF EXISTS "expected_balance";
    `);
  }
}
