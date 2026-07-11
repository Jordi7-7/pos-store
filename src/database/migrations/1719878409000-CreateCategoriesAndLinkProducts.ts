import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategoriesAndLinkProducts1719878409000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categories_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "products" ADD COLUMN "category_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "products" ADD CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_products_category"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "category_id"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
