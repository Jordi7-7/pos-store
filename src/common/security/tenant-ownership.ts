import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

async function assertAllBelongToTenant(
  entityManager: EntityManager,
  table: 'branches' | 'users',
  tenantId: string,
  ids: readonly string[],
  message: string,
): Promise<void> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return;

  const rows: unknown[] = await entityManager.query(
    `SELECT "id" FROM "${table}" WHERE "id" = ANY($1::uuid[]) AND "tenant_id" = $2`,
    [unique, tenantId],
  );
  if (rows.length !== unique.length) {
    throw new AppException(ErrorCode.InvalidReference, message, HttpStatus.BAD_REQUEST);
  }
}

/** Lanza 400 si alguna sucursal no existe o pertenece a otro tenant (evita IDs ajenos en SQL crudo). */
export function assertBranchesBelongToTenant(
  entityManager: EntityManager,
  tenantId: string,
  branchIds: readonly string[],
): Promise<void> {
  return assertAllBelongToTenant(entityManager, 'branches', tenantId, branchIds, 'Una o más sucursales no existen en esta tienda.');
}

/** Lanza 400 si algún usuario no existe o pertenece a otro tenant. */
export function assertUsersBelongToTenant(
  entityManager: EntityManager,
  tenantId: string,
  userIds: readonly string[],
): Promise<void> {
  return assertAllBelongToTenant(entityManager, 'users', tenantId, userIds, 'Uno o más usuarios no existen en esta tienda.');
}
