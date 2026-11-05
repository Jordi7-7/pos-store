import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Regla de negocio: solo puede haber UNA sesión de caja abierta por caja registradora.
 * Hasta ahora solo se comprobaba en la aplicación (dos aperturas simultáneas podían crear
 * dos sesiones abiertas). Este índice único parcial lo garantiza en la base de datos.
 *
 * ANTES DE EJECUTAR: comprueba que no haya duplicados existentes, o la migración fallará:
 *   SELECT cash_register_id, COUNT(*) FROM cash_sessions
 *    WHERE status = 'OPEN' AND cash_register_id IS NOT NULL
 *    GROUP BY cash_register_id HAVING COUNT(*) > 1;
 * Si devuelve filas, cierra las sesiones sobrantes desde la aplicación antes de migrar.
 */
export class AddUniqueOpenSessionPerCashRegister1792900000000 implements MigrationInterface {
  name = 'AddUniqueOpenSessionPerCashRegister1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cash_sessions_open_per_register"
         ON "cash_sessions" ("cash_register_id")
         WHERE "status" = 'OPEN' AND "cash_register_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cash_sessions_open_per_register"`);
  }
}
