import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSlugAndLogoToTenantsAndScopeUsersUniqueness1787636340000 implements MigrationInterface {
  name = 'AddSlugAndLogoToTenantsAndScopeUsersUniqueness1787636340000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add slug and logo_url to tenants
    await queryRunner.query(`
      ALTER TABLE "tenants" 
      ADD COLUMN IF NOT EXISTS "slug" character varying,
      ADD COLUMN IF NOT EXISTS "logo_url" character varying;
    `);

    // 2. Populate slug for existing tenants
    await queryRunner.query(`
      UPDATE "tenants" 
      SET "slug" = LOWER(REGEXP_REPLACE(TRIM("name"), '[^a-zA-Z0-9]+', '-', 'g')) 
      WHERE "slug" IS NULL OR "slug" = '';
    `);

    await queryRunner.query(`
      UPDATE "tenants" 
      SET "slug" = 'tienda-' || SUBSTRING("id"::text, 1, 8) 
      WHERE "slug" IS NULL OR "slug" = '';
    `);

    // 3. Make slug NOT NULL and add UNIQUE constraint
    await queryRunner.query(`
      ALTER TABLE "tenants" ALTER COLUMN "slug" SET NOT NULL;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UQ_tenants_slug') THEN
          ALTER TABLE "tenants" ADD CONSTRAINT "UQ_tenants_slug" UNIQUE ("slug");
        END IF;
      END $$;
    `);

    // 4. Add username to users
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "username" character varying;
    `);

    // 5. Drop global UQ_users_email and create composite index (tenant_id, email) & (tenant_id, username)
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_email";
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_tenant_email" 
      ON "users" ("tenant_id", "email") 
      WHERE "deleted_at" IS NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_tenant_username" 
      ON "users" ("tenant_id", "username") 
      WHERE "deleted_at" IS NULL AND "username" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_tenant_username"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_tenant_email"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "username"`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_email" UNIQUE ("email")`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "UQ_tenants_slug"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "logo_url"`);
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN IF EXISTS "slug"`);
  }
}
