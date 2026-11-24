import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY = 'action:products.adjust_stock';
const NEW_PERMISSIONS = ['action:products.stock_entry', 'action:products.stock_exit', 'action:products.stock_count', 'action:products.stock_transfer'];

/**
 * El permiso de ajustar stock se separa en entrada, salida, conteo y traslado. Para que nadie pierda lo que ya podía hacer,
 * todo rol (y todo usuario con permisos propios) que tenía el permiso anterior recibe los cuatro nuevos. El permiso
 * anterior se conserva. Es idempotente: no duplica permisos si se aplica de nuevo.
 */
export class GrantStockPermissionsToExistingRoles1794100000000 implements MigrationInterface {
  name = 'GrantStockPermissionsToExistingRoles1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['roles', 'users']) {
      const column = table === 'roles' ? 'permissions' : 'custom_permissions';
      await queryRunner.query(
        `UPDATE "${table}"
            SET "${column}" = ARRAY(SELECT DISTINCT unnest("${column}" || $2::text[]))
          WHERE $1 = ANY("${column}")`,
        [LEGACY, NEW_PERMISSIONS],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['roles', 'users']) {
      const column = table === 'roles' ? 'permissions' : 'custom_permissions';
      await queryRunner.query(`UPDATE "${table}" SET "${column}" = ARRAY(SELECT unnest("${column}") EXCEPT SELECT unnest($1::text[])) WHERE "${column}" && $1::text[]`, [NEW_PERMISSIONS]);
    }
  }
}
