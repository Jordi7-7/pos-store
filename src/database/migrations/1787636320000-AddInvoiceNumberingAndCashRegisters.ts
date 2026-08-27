import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceNumberingAndCashRegisters1787636320000 implements MigrationInterface {
  name = 'AddInvoiceNumberingAndCashRegisters1787636320000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Alter branches
    await queryRunner.query(`
      ALTER TABLE "branches" ADD COLUMN "code" integer DEFAULT 1;
    `);
    await queryRunner.query(`
      UPDATE "branches" SET "code" = 1 WHERE "code" IS NULL;
    `);

    // 2. Create cash_registers table
    await queryRunner.query(`
      CREATE TABLE "cash_registers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "code" integer NOT NULL,
        "name" character varying NOT NULL,
        "next_invoice_number" integer NOT NULL DEFAULT 1,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_cash_registers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cash_registers_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cash_registers_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);

    // 3. Create unique index for cash registers
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_cash_registers_tenant_branch_code" ON "cash_registers" ("tenant_id", "branch_id", "code") WHERE "deleted_at" IS NULL
    `);

    // 4. Alter cash_sessions
    await queryRunner.query(`
      ALTER TABLE "cash_sessions" ADD COLUMN "cash_register_id" uuid;
    `);
    await queryRunner.query(`
      ALTER TABLE "cash_sessions" ADD CONSTRAINT "FK_cash_sessions_cash_register" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE SET NULL;
    `);

    // 5. Alter sales
    await queryRunner.query(`
      ALTER TABLE "sales" ADD COLUMN "invoice_number" character varying;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_sales_tenant_invoice_number" ON "sales" ("tenant_id", "invoice_number") WHERE "invoice_number" IS NOT NULL AND "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_sales_tenant_invoice_number"`);
    await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN "invoice_number"`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" DROP CONSTRAINT "FK_cash_sessions_cash_register"`);
    await queryRunner.query(`ALTER TABLE "cash_sessions" DROP COLUMN "cash_register_id"`);
    await queryRunner.query(`DROP INDEX "IDX_cash_registers_tenant_branch_code"`);
    await queryRunner.query(`DROP TABLE "cash_registers"`);
    await queryRunner.query(`ALTER TABLE "branches" DROP COLUMN "code"`);
  }
}
