import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSalesAndPOSSchema1719878404000 implements MigrationInterface {
  name = 'CreateSalesAndPOSSchema1719878404000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cash_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "branch_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "opening_balance" numeric(10,2) NOT NULL,
        "closing_balance" numeric(10,2),
        "status" character varying NOT NULL,
        "opened_at" TIMESTAMP NOT NULL,
        "closed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_cash_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cash_sessions_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cash_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sales" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "cash_session_id" uuid NOT NULL,
        "customer_id" uuid,
        "subtotal" numeric(10,2) NOT NULL,
        "total" numeric(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_sales_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_cash_session" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sale_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" numeric(10,2) NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "cost" numeric(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_sale_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sale_items_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sale_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id" uuid NOT NULL,
        "payment_method" character varying NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "reference_number" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_sale_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sale_payments_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "description" character varying NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "category" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_expenses_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expenses_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_expenses_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refunds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "sale_id" uuid NOT NULL,
        "cash_session_id" uuid NOT NULL,
        "total_refunded" numeric(10,2) NOT NULL,
        "reason" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_refunds_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refunds_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refunds_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refunds_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refunds_cash_session" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "refund_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" numeric(10,2) NOT NULL,
        "price_refunded" numeric(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_refund_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refund_items_refund" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refund_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refund_items"`);
    await queryRunner.query(`DROP TABLE "refunds"`);
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP TABLE "sale_payments"`);
    await queryRunner.query(`DROP TABLE "sale_items"`);
    await queryRunner.query(`DROP TABLE "sales"`);
    await queryRunner.query(`DROP TABLE "cash_sessions"`);
  }
}
