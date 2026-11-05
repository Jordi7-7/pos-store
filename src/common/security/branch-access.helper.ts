import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

const USER_BRANCHES_CACHE_TTL = 3600; // 1 hour

/**
 * Returns cache key for user assigned branch IDs.
 */
export function getUserBranchesCacheKey(userId: string): string {
  return `user_branches:${userId}`;
}

/**
 * Invalidates the cached branch IDs for a given user in Redis.
 */
export async function invalidateUserBranchesCache(
  redisService: RedisService,
  userId: string,
): Promise<void> {
  await redisService.del(getUserBranchesCacheKey(userId));
}

/**
 * Retrieves assigned branch IDs for a user utilizing the Redis Cache-Aside pattern.
 * If cached in Redis -> returns immediately (< 1ms).
 * If not in Redis -> queries database, warms up Redis cache, and returns.
 */
export async function getUserAssignedBranchIds(
  entityManager: EntityManager,
  redisService: RedisService,
  userId: string,
): Promise<string[]> {
  const cacheKey = getUserBranchesCacheKey(userId);

  // 1. Try reading from Redis cache
  const cached = await redisService.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // JSON parse error fallback
    }
  }

  // 2. Cache miss -> query DB (fast index lookup on user_branches)
  const rows = await entityManager.query(
    `SELECT branch_id FROM "user_branches" WHERE "user_id" = $1`,
    [userId],
  );
  const branchIds: string[] = (rows || []).map((r: any) => String(r.branch_id));

  // 3. Populate Redis cache
  await redisService.set(cacheKey, JSON.stringify(branchIds), USER_BRANCHES_CACHE_TTL);

  return branchIds;
}

export interface AssertUserBranchOptions {
  userId?: string;
  isOwner?: boolean;
  branchId?: string;
  actionDescription: string;
}

/**
 * Enforces role and branch permission using Redis Cache-Aside.
 * - If user is OWNER: allowed everywhere (branchId is optional).
 * - If user is NOT OWNER: branchId is required, and must be in user's assigned branches.
 */
export async function assertUserCanAccessBranch(
  entityManager: EntityManager,
  redisService: RedisService,
  options: AssertUserBranchOptions,
): Promise<void> {
  const { userId, isOwner, branchId, actionDescription } = options;

  if (isOwner) {
    return;
  }

  if (!branchId) {
    throw new AppException(ErrorCode.BranchRequired, `Debes seleccionar una sucursal para ${actionDescription}.`, HttpStatus.BAD_REQUEST);
  }

  if (!userId) {
    throw new AppException(ErrorCode.UserNotAuthenticated, `Usuario no autenticado o no válido para ${actionDescription}.`, HttpStatus.FORBIDDEN);
  }

  const userBranchIds = await getUserAssignedBranchIds(
    entityManager,
    redisService,
    userId,
  );

  if (!userBranchIds.includes(branchId)) {
    throw new AppException(ErrorCode.BranchAccessDenied, `No tienes permisos para ${actionDescription} en la sucursal seleccionada.`, HttpStatus.FORBIDDEN, { branchId });
  }
}

export interface AssertUserOperatesInBranchOptions {
  tenantId: string;
  userId: string | null | undefined;
  branchId: string;
  actionDescription: string;
}

/**
 * Variante para comandos que solo reciben `userId`: resuelve si el usuario es propietario
 * (dentro del mismo tenant) y delega en `assertUserCanAccessBranch`.
 */
export async function assertUserCanOperateInBranch(
  entityManager: EntityManager,
  redisService: RedisService,
  options: AssertUserOperatesInBranchOptions,
): Promise<void> {
  const { tenantId, userId, branchId, actionDescription } = options;

  if (!userId) {
    throw new AppException(ErrorCode.UserNotAuthenticated, `Usuario no autenticado o no válido para ${actionDescription}.`, HttpStatus.FORBIDDEN);
  }

  const rows: Array<{ is_owner: boolean }> = await entityManager.query(
    `SELECT "is_owner" FROM "users" WHERE "id" = $1 AND "tenant_id" = $2 AND "is_active" = true`,
    [userId, tenantId],
  );
  if (rows.length === 0) {
    throw new AppException(ErrorCode.UserNotValid, `Usuario no válido para ${actionDescription}.`, HttpStatus.FORBIDDEN);
  }

  await assertUserCanAccessBranch(entityManager, redisService, {
    userId,
    isOwner: rows[0].is_owner === true,
    branchId,
    actionDescription,
  });
}
