import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../redis/redis.service';

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
    throw new BadRequestException(
      `Debes seleccionar una sucursal para ${actionDescription}.`,
    );
  }

  if (!userId) {
    throw new ForbiddenException(
      `Usuario no autenticado o no válido para ${actionDescription}.`,
    );
  }

  const userBranchIds = await getUserAssignedBranchIds(
    entityManager,
    redisService,
    userId,
  );

  if (!userBranchIds.includes(branchId)) {
    throw new ForbiddenException(
      `No tienes permisos para ${actionDescription} en la sucursal seleccionada.`,
    );
  }
}
