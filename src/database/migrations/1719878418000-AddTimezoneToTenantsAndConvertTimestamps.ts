import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimezoneToTenantsAndConvertTimestamps1719878418000 implements MigrationInterface {
  name = 'AddTimezoneToTenantsAndConvertTimestamps1719878418000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add timezone column to tenants
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN IF NOT EXISTS "timezone" character varying NOT NULL DEFAULT 'America/Guayaquil'
    `);

    // 2. Convert timestamp columns in "tenants" to timestamptz
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE USING "created_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE USING "updated_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "deleted_at" TYPE TIMESTAMP WITH TIME ZONE USING "deleted_at" AT TIME ZONE 'UTC'`);

    // 3. Convert timestamp columns in "users" to timestamptz
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE USING "created_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE USING "updated_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "deleted_at" TYPE TIMESTAMP WITH TIME ZONE USING "deleted_at" AT TIME ZONE 'UTC'`);

    // 4. Convert timestamp columns in "cash_sessions" to timestamptz
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE USING "created_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "updated_at" TYPE TIMESTAMP WITH TIME ZONE USING "updated_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "deleted_at" TYPE TIMESTAMP WITH TIME ZONE USING "deleted_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "opened_at" TYPE TIMESTAMP WITH TIME ZONE USING "opened_at" AT TIME ZONE 'UTC'`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "closed_at" TYPE TIMESTAMP WITH TIME ZONE USING "closed_at" AT TIME ZONE 'UTC'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert cash_sessions to timestamp without time zone
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "closed_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "opened_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "deleted_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "updated_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" ALTER COLUMN "created_at" TYPE TIMESTAMP`);

    // Revert users to timestamp without time zone
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "deleted_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "updated_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "created_at" TYPE TIMESTAMP`);

    // Revert tenants to timestamp without time zone
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "deleted_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "updated_at" TYPE TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "created_at" TYPE TIMESTAMP`);

    // Drop timezone column
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "timezone"`);
  }
}
