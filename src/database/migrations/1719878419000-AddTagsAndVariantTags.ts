import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTagsAndVariantTags1719878419000 implements MigrationInterface {
  name = 'AddTagsAndVariantTags1719878419000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create tags table
    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"  uuid                     NOT NULL,
        "name"       character varying        NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tags" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tags_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id") ON DELETE CASCADE
      )
    `);

    // 2. Create variant_tags join table
    await queryRunner.query(`
      CREATE TABLE "variant_tags" (
        "variant_id" uuid NOT NULL,
        "tag_id"     uuid NOT NULL,
        CONSTRAINT "PK_variant_tags" PRIMARY KEY ("variant_id", "tag_id"),
        CONSTRAINT "FK_variant_tags_variant" FOREIGN KEY ("variant_id")
          REFERENCES "product_variants" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_variant_tags_tag" FOREIGN KEY ("tag_id")
          REFERENCES "tags" ("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "variant_tags"`);
    await queryRunner.query(`DROP TABLE "tags"`);
  }
}
