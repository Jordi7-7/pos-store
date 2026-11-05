import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Regla única del SKU: sin espacios en los extremos y en MAYÚSCULAS (igual que el SKU base). Hasta ahora
 * el SKU de la variante se guardaba tal como se tecleaba, así que "cam-1" y "CAM-1" podían coexistir y las
 * búsquedas e importaciones comparaban de forma distinta.
 *
 * Si dos SKUs activos de una misma tienda solo se diferencian por mayúsculas o espacios, la migración
 * se detiene con un mensaje claro en vez de elegir uno: hay que renombrar uno a mano y reintentar.
 */
export class NormalizeVariantSkusToUppercase1793700000000 implements MigrationInterface {
  name = 'NormalizeVariantSkusToUppercase1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{ tenant_id: string; sku: string; total: string }> = await queryRunner.query(`
      SELECT "tenant_id", UPPER(BTRIM("sku")) AS sku, COUNT(*) AS total
      FROM "product_variants"
      WHERE "deleted_at" IS NULL
      GROUP BY "tenant_id", UPPER(BTRIM("sku"))
      HAVING COUNT(*) > 1
    `);
    if (duplicates.length > 0) {
      const sample = duplicates
        .slice(0, 5)
        .map((row) => `${row.sku} (x${row.total}, tienda ${row.tenant_id})`)
        .join('; ');
      throw new Error(`Hay ${duplicates.length} SKUs de variante que solo difieren en mayúsculas o espacios; renombra uno antes de migrar. Ejemplos: ${sample}`);
    }

    await queryRunner.query(`
      UPDATE "product_variants"
      SET "sku" = UPPER(BTRIM("sku"))
      WHERE "sku" <> UPPER(BTRIM("sku"))
    `);
  }

  public async down(): Promise<void> {
    // No se puede recuperar la capitalización original.
  }
}
