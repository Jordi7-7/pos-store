import { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY = 'action:products.adjust_stock';

/**
 * El permiso «ajuste de un producto (heredado)» ya no abre ningún endpoint (el ajuste antiguo se retiró) y sale del catálogo.
 * Se quita de todo rol y de los permisos propios de los usuarios: si quedara guardado, editar ese rol desde la pantalla
 * fallaría con INVALID_PERMISSIONS. Quien lo tenía ya recibió entrada, salida, conteo y traslado con la migración
 * `1794100000000`, así que nadie pierde nada. Es idempotente.
 */
export class RemoveLegacyAdjustStockPermission1794200000000 implements MigrationInterface {
  name = 'RemoveLegacyAdjustStockPermission1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "roles" SET "permissions" = array_remove("permissions", $1) WHERE $1 = ANY("permissions")`, [LEGACY]);
    await queryRunner.query(`UPDATE "users" SET "custom_permissions" = array_remove("custom_permissions", $1) WHERE $1 = ANY("custom_permissions")`, [LEGACY]);
  }

  /** No se puede saber quién lo tenía, y el permiso ya no existe en el catálogo: no hay nada que devolver. */
  public async down(): Promise<void> {
    // intencionalmente vacío
  }
}
