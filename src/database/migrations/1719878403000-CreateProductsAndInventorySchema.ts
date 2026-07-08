import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductsAndInventorySchema1719878403000 implements MigrationInterface {
  name = 'CreateProductsAndInventorySchema1719878403000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "description" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_products_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "attributes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_attributes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attributes_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "attribute_values" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "attribute_id" uuid NOT NULL,
        "value" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_attribute_values_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attribute_values_attribute" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "sku" character varying NOT NULL,
        "barcode" character varying NOT NULL,
        "purchase_price" numeric(10,2) NOT NULL,
        "sale_price" numeric(10,2) NOT NULL,
        "image_url" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_variants_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_variants_sku" UNIQUE ("sku"),
        CONSTRAINT "UQ_product_variants_barcode" UNIQUE ("barcode"),
        CONSTRAINT "FK_product_variants_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "variant_attribute_values" (
        "variant_id" uuid NOT NULL,
        "attribute_value_id" uuid NOT NULL,
        CONSTRAINT "PK_variant_attribute_values" PRIMARY KEY ("variant_id", "attribute_value_id"),
        CONSTRAINT "FK_variant_attribute_values_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_variant_attribute_values_value" FOREIGN KEY ("attribute_value_id") REFERENCES "attribute_values"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_stocks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "branch_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "quantity" numeric(10,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_stocks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_stocks_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_stocks_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_stocks_branch_variant" ON "product_stocks" ("branch_id", "variant_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "origin_branch_id" uuid,
        "destination_branch_id" uuid,
        "variant_id" uuid NOT NULL,
        "quantity" numeric(10,2) NOT NULL,
        "type" character varying NOT NULL,
        "reason" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_inventory_movements_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_movements_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inventory_movements_origin" FOREIGN KEY ("origin_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_inventory_movements_destination" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_inventory_movements_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "inventory_movements"`);
    await queryRunner.query(`DROP INDEX "IDX_product_stocks_branch_variant"`);
    await queryRunner.query(`DROP TABLE "product_stocks"`);
    await queryRunner.query(`DROP TABLE "variant_attribute_values"`);
    await queryRunner.query(`DROP TABLE "product_variants"`);
    await queryRunner.query(`DROP TABLE "attribute_values"`);
    await queryRunner.query(`DROP TABLE "attributes"`);
    await queryRunner.query(`DROP TABLE "products"`);
  }
}
