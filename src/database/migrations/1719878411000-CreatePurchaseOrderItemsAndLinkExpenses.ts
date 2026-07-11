import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePurchaseOrderItemsAndLinkExpenses1719878411000 implements MigrationInterface {
  name = 'CreatePurchaseOrderItemsAndLinkExpenses1719878411000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create purchase_order_items table
    await queryRunner.query(`
      CREATE TABLE "purchase_order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_order_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" numeric(10,2) NOT NULL,
        "purchase_price" numeric(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_purchase_order_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_purchase_order_items_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_purchase_order_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);

    // 2. Alter expenses table to add cash_session_id
    await queryRunner.query(`
      ALTER TABLE "expenses" 
      ADD COLUMN "cash_session_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "expenses" 
      ADD CONSTRAINT "FK_expenses_cash_session" 
      FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Remove FK and Column from expenses
    await queryRunner.query(`
      ALTER TABLE "expenses" 
      DROP CONSTRAINT "FK_expenses_cash_session"
    `);

    await queryRunner.query(`
      ALTER TABLE "expenses" 
      DROP COLUMN "cash_session_id"
    `);

    // 2. Drop purchase_order_items table
    await queryRunner.query(`DROP TABLE "purchase_order_items"`);
  }
}
