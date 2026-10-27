import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUsernameRequiredAndEmailOptionalInUsers1792700000000 implements MigrationInterface {
  name = 'MakeUsernameRequiredAndEmailOptionalInUsers1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Backfill any existing users with NULL username using the prefix of their email
    await queryRunner.query(`
      UPDATE "users"
      SET "username" = LOWER(SPLIT_PART("email", '@', 1))
      WHERE "username" IS NULL;
    `);

    // In case of duplicates in the same tenant, append substring of id to guarantee uniqueness
    await queryRunner.query(`
      UPDATE "users" u1
      SET "username" = u1.username || '_' || SUBSTRING(u1.id::text, 1, 4)
      WHERE EXISTS (
        SELECT 1 FROM "users" u2
        WHERE u2.tenant_id = u1.tenant_id
          AND u2.username = u1.username
          AND u2.id <> u1.id
      );
    `);

    // 2. Make username NOT NULL
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "username" SET NOT NULL;
    `);

    // 3. Make email NULLABLE (drop NOT NULL constraint)
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "email" DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "email" = "username" || '@placeholder.com'
      WHERE "email" IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "email" SET NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "username" DROP NOT NULL;
    `);
  }
}
