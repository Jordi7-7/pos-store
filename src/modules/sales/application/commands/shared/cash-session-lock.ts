import { EntityManager } from 'typeorm';

/**
 * Bloquea la fila de la sesión de caja dentro de la transacción actual.
 * - `share`: ventas, devoluciones y gastos (pueden ejecutarse a la vez entre sí);
 * - `update`: el cierre de caja, que espera a que terminen las operaciones en curso y
 *   hace que las siguientes vean la sesión ya cerrada. Así ninguna venta "se cuela"
 *   entre el cálculo del cierre y su guardado.
 * Se usa SQL directo porque un FOR UPDATE con relaciones (LEFT JOIN) falla en Postgres.
 */
export async function lockCashSession(
  entityManager: EntityManager,
  cashSessionId: string,
  mode: 'share' | 'update',
): Promise<void> {
  const clause = mode === 'update' ? 'FOR UPDATE' : 'FOR SHARE';
  await entityManager.query(`SELECT "id" FROM "cash_sessions" WHERE "id" = $1 ${clause}`, [cashSessionId]);
}
