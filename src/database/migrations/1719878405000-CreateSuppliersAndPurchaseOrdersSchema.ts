import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSuppliersAndPurchaseOrdersSchema1719878405000 implements MigrationInterface {
  name = 'CreateSuppliersAndPurchaseOrdersSchema1719878405000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create Suppliers table
    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "identity_number" varchar NOT NULL,
        "name" varchar NOT NULL,
        "email" varchar,
        "phone" varchar,
        "address" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_suppliers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_suppliers_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // Create unique partial index for tenant_id and identity_number (soft-delete safe)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_suppliers_tenant_identity" 
      ON "suppliers" ("tenant_id", "identity_number") 
      WHERE "deleted_at" IS NULL
    `);

    // 2. Create Purchase Orders table
    await queryRunner.query(`
      CREATE TABLE "purchase_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "supplier_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "invoice_number" varchar,
        "total_amount" numeric(10,2) NOT NULL DEFAULT 0.00,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_purchase_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_purchase_orders_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_purchase_orders_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_purchase_orders_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT
      )
    `);

    // 3. Alter Inventory Movements to add purchase_order_id reference
    await queryRunner.query(`
      ALTER TABLE "inventory_movements" 
      ADD COLUMN "purchase_order_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_movements" 
      ADD CONSTRAINT "FK_inventory_movements_purchase_order" 
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Remove FK and Column from inventory_movements
    await queryRunner.query(`
      ALTER TABLE "inventory_movements" 
      DROP CONSTRAINT "FK_inventory_movements_purchase_order"
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_movements" 
      DROP COLUMN "purchase_order_id"
    `);

    // 2. Drop purchase_orders table
    await queryRunner.query(`DROP TABLE "purchase_orders"`);

    // 3. Drop unique index and suppliers table
    await queryRunner.query(`DROP INDEX "IDX_suppliers_tenant_identity"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);
  }
}
