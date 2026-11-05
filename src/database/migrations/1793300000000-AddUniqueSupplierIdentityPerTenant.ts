import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El documento del proveedor es único entre los proveedores activos de cada tienda. Hasta ahora solo
 * lo comprobaba la aplicación, así que dos altas simultáneas podían duplicarlo.
 *
 * Si ya hay duplicados la migración se detiene con un mensaje claro en vez de borrar o fusionar datos:
 * hay que resolverlos a mano (y apuntar las compras al proveedor que se conserve) antes de reintentar.
 */
export class AddUniqueSupplierIdentityPerTenant1793300000000 implements MigrationInterface {
  name = 'AddUniqueSupplierIdentityPerTenant1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{ tenant_id: string; identity_number: string; total: string }> = await queryRunner.query(`
      SELECT tenant_id, identity_number, COUNT(*) AS total
      FROM "suppliers"
      WHERE "deleted_at" IS NULL
      GROUP BY tenant_id, identity_number
      HAVING COUNT(*) > 1
    `);
    if (duplicates.length > 0) {
      const sample = duplicates
        .slice(0, 5)
        .map((row) => `${row.identity_number} (x${row.total}, tienda ${row.tenant_id})`)
        .join('; ');
      throw new Error(`Hay ${duplicates.length} documentos de proveedor repetidos; resuélvelos antes de migrar. Ejemplos: ${sample}`);
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_suppliers_tenant_identity" ON "suppliers" ("tenant_id", "identity_number") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_suppliers_tenant_identity"`);
  }
}
