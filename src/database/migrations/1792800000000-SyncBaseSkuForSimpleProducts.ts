import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyncBaseSkuForSimpleProducts1792800000000 implements MigrationInterface {
  name = 'SyncBaseSkuForSimpleProducts1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sincronizar base_sku en la tabla principal products para productos simples que lo tenían en null
    // Esto permite ordenamiento alfabético indexado y paginación ultrarrápida sin duplicados
    await queryRunner.query(
      `UPDATE "products" p
       SET "base_sku" = v."sku"
       FROM "product_variants" v
       WHERE v."product_id" = p."id"
         AND (p."base_sku" IS NULL OR p."base_sku" = '')
         AND v."deleted_at" IS NULL;`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "products"
       SET "base_sku" = NULL
       WHERE "type" = 'SIMPLE';`
    );
  }
}
