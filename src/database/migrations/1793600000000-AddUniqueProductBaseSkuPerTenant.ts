import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El SKU base de un producto es único por tienda, sin distinguir mayúsculas. En un producto simple es
 * el SKU de su única variante; en uno con variantes, el prefijo de la familia.
 *
 * 1. Se realinea el SKU base de los productos simples con el SKU de su variante (al editar el SKU
 *    de un producto simple el SKU base quedaba con el valor anterior).
 * 2. Si aún hay SKUs base repetidos se detiene con un mensaje claro, sin borrar ni fusionar datos:
 *    hay que resolverlos a mano y reintentar.
 */
export class AddUniqueProductBaseSkuPerTenant1793600000000 implements MigrationInterface {
  name = 'AddUniqueProductBaseSkuPerTenant1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "products" p
      SET "base_sku" = UPPER(v."sku")
      FROM "product_variants" v
      WHERE v."product_id" = p."id"
        AND v."deleted_at" IS NULL
        AND p."type" = 'SIMPLE'
        AND p."deleted_at" IS NULL
        AND (SELECT COUNT(*) FROM "product_variants" x WHERE x."product_id" = p."id" AND x."deleted_at" IS NULL) = 1
        AND p."base_sku" IS DISTINCT FROM UPPER(v."sku")
    `);

    const duplicates: Array<{ tenant_id: string; code: string; total: string }> = await queryRunner.query(`
      SELECT "tenant_id", UPPER("base_sku") AS code, COUNT(*) AS total
      FROM "products"
      WHERE "deleted_at" IS NULL AND "base_sku" IS NOT NULL AND "base_sku" <> ''
      GROUP BY "tenant_id", UPPER("base_sku")
      HAVING COUNT(*) > 1
    `);
    if (duplicates.length > 0) {
      const sample = duplicates
        .slice(0, 5)
        .map((row) => `${row.code} (x${row.total}, tienda ${row.tenant_id})`)
        .join('; ');
      throw new Error(`Hay ${duplicates.length} SKUs base de producto repetidos; resuélvelos antes de migrar. Ejemplos: ${sample}`);
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_tenant_base_sku_ci"
      ON "products" ("tenant_id", UPPER("base_sku"))
      WHERE "deleted_at" IS NULL AND "base_sku" IS NOT NULL AND "base_sku" <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_products_tenant_base_sku_ci"`);
  }
}
