import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsOwnerToUsersAndDropRole1792699800000 implements MigrationInterface {
  name = 'AddIsOwnerToUsersAndDropRole1792699800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add is_owner column defaulting to false
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "is_owner" boolean NOT NULL DEFAULT false
    `);

    // 2. Migrate existing owners
    await queryRunner.query(`
      UPDATE "users"
      SET "is_owner" = true
      WHERE "role" ILIKE 'OWNER'
    `);

    // 3. Drop legacy role column
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "role"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" character varying(50) DEFAULT 'CASHIER'
    `);

    await queryRunner.query(`
      UPDATE "users"
      SET "role" = 'OWNER'
      WHERE "is_owner" = true
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "is_owner"
    `);
  }
}
