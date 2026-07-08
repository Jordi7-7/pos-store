import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateUniqueConstraintsToPartialIndexes1719878407000 implements MigrationInterface {
  name = 'MigrateUniqueConstraintsToPartialIndexes1719878407000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tenants: Drop UQ constraint on RUC, create partial unique index
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      DROP CONSTRAINT IF EXISTS "UQ_tenants_ruc"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_tenants_ruc_partial" 
      ON "tenants" ("ruc") 
      WHERE "deleted_at" IS NULL
    `);

    // 2. Users: Drop UQ constraint on Email, create partial unique index
    await queryRunner.query(`
      ALTER TABLE "users" 
      DROP CONSTRAINT IF EXISTS "UQ_users_email"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email_partial" 
      ON "users" ("email") 
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert 2. Users: Drop partial index, restore constraint
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_partial"`);
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD CONSTRAINT "UQ_users_email" UNIQUE ("email")
    `);

    // Revert 1. Tenants: Drop partial index, restore constraint
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_tenants_ruc_partial"`);
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD CONSTRAINT "UQ_tenants_ruc" UNIQUE ("ruc")
    `);
  }
}
