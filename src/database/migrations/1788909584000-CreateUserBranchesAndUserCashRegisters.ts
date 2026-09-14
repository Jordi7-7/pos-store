import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserBranchesAndUserCashRegisters1788909584000 implements MigrationInterface {
  name = 'CreateUserBranchesAndUserCashRegisters1788909584000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create user_branches table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_branches" (
        "user_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        CONSTRAINT "PK_user_branches" PRIMARY KEY ("user_id", "branch_id"),
        CONSTRAINT "FK_user_branches_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_branches_user_id" ON "user_branches"("user_id");
      CREATE INDEX IF NOT EXISTS "IDX_user_branches_branch_id" ON "user_branches"("branch_id");
    `);

    // 2. Create user_cash_registers table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_cash_registers" (
        "user_id" uuid NOT NULL,
        "cash_register_id" uuid NOT NULL,
        CONSTRAINT "PK_user_cash_registers" PRIMARY KEY ("user_id", "cash_register_id"),
        CONSTRAINT "FK_user_cash_registers_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_cash_registers_register" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_cash_registers_user_id" ON "user_cash_registers"("user_id");
      CREATE INDEX IF NOT EXISTS "IDX_user_cash_registers_register_id" ON "user_cash_registers"("cash_register_id");
    `);

    // 3. Grant view:cash_registers and action:cash_registers.manage to all existing Administrador roles
    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = array_cat("permissions", ARRAY['view:cash_registers', 'action:cash_registers.manage'])
      WHERE "name" ILIKE '%ADMIN%'
        AND NOT ('view:cash_registers' = ANY("permissions"));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_cash_registers";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_branches";`);
  }
}
