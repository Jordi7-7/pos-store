import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductImagesAndMappings1719878408000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "url" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_product_images_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_images_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_image_mappings" (
        "product_id" uuid NOT NULL,
        "product_image_id" uuid NOT NULL,
        CONSTRAINT "PK_product_image_mappings" PRIMARY KEY ("product_id", "product_image_id"),
        CONSTRAINT "FK_product_image_mappings_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_image_mappings_image" FOREIGN KEY ("product_image_id") REFERENCES "product_images"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_variant_image_mappings" (
        "product_variant_id" uuid NOT NULL,
        "product_image_id" uuid NOT NULL,
        CONSTRAINT "PK_product_variant_image_mappings" PRIMARY KEY ("product_variant_id", "product_image_id"),
        CONSTRAINT "FK_product_variant_image_mappings_variant" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_variant_image_mappings_image" FOREIGN KEY ("product_image_id") REFERENCES "product_images"("id") ON DELETE CASCADE
      )
    `);

    // Deprecate/Allow null on the old variant.image_url column (optional, we keep it but it won't be used)
    await queryRunner.query(`
      ALTER TABLE "product_variants" ALTER COLUMN "image_url" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_variant_image_mappings"`);
    await queryRunner.query(`DROP TABLE "product_image_mappings"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
  }
}
