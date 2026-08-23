import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPinAndUserIdToSalesRefunds1719878417000 implements MigrationInterface {
  name = 'AddPinAndUserIdToSalesRefunds1719878417000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add PIN fields to users
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "pin" character varying,
      ADD COLUMN IF NOT EXISTS "pin_enabled" boolean NOT NULL DEFAULT false
    `);

    // Add user_id to sales (nullable for backward compatibility)
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "user_id" uuid,
      ADD CONSTRAINT "FK_sales_user_id" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Add user_id to refunds (nullable for backward compatibility)
    await queryRunner.query(`
      ALTER TABLE "refunds"
      ADD COLUMN IF NOT EXISTS "user_id" uuid,
      ADD CONSTRAINT "FK_refunds_user_id" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "FK_refunds_user_id"`);
    await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN IF EXISTS "user_id"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "FK_sales_user_id"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "user_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pin_enabled"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "pin"`);
  }
}
