import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

interface AccessRow {
  is_owner: boolean;
  assigned: boolean;
}

/**
 * Regla de negocio: cualquier cajero asignado a una caja puede operar (vender, devolver,
 * registrar gastos) sobre la sesión abierta de esa caja, aunque la haya abierto otro.
 * El propietario puede operar en cualquier caja. Sesiones antiguas sin caja
 * (`cashRegisterId` nulo) no se restringen.
 */
export async function assertUserAssignedToCashRegister(
  entityManager: EntityManager,
  options: {
    tenantId: string;
    userId: string | null | undefined;
    cashRegisterId: string | null | undefined;
    actionDescription: string;
  },
): Promise<void> {
  const { tenantId, userId, cashRegisterId, actionDescription } = options;

  if (!cashRegisterId) return;

  const forbidden = (): AppException =>
    new AppException(
      ErrorCode.CashRegisterNotAssigned,
      `No tienes asignada esta caja registradora para ${actionDescription}.`,
      HttpStatus.FORBIDDEN,
    );

  if (!userId) throw forbidden();

  const rows: AccessRow[] = await entityManager.query(
    `SELECT u."is_owner" AS is_owner,
            EXISTS (
              SELECT 1 FROM "user_cash_registers" ucr
              WHERE ucr."user_id" = u."id" AND ucr."cash_register_id" = $3
            ) AS assigned
       FROM "users" u
      WHERE u."id" = $1 AND u."tenant_id" = $2 AND u."is_active" = true`,
    [userId, tenantId, cashRegisterId],
  );

  const row = rows[0];
  if (!row || (!row.is_owner && !row.assigned)) throw forbidden();
}
