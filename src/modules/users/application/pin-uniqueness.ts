import { EntityManager } from 'typeorm';
import { HashService } from '../../auth/services/hash.service';
import { User } from '../domain/entities/user.entity';

/**
 * Indica si un PIN en claro ya lo usa otro usuario activo del mismo tenant. Los PIN
 * se guardan con hash, por lo que se comparan uno a uno. El inicio de sesión por PIN
 * identifica al usuario solo por el PIN, así que debe ser único dentro del tenant.
 */
export async function isPinInUse(
  entityManager: EntityManager,
  hashService: HashService,
  tenantId: string,
  pin: string,
  excludeUserId?: string,
): Promise<boolean> {
  const users = await entityManager
    .getRepository(User)
    .createQueryBuilder('user')
    .addSelect('user.pin')
    .where('user.tenantId = :tenantId', { tenantId })
    .andWhere('user.pin IS NOT NULL')
    .getMany();

  for (const user of users) {
    if (user.id === excludeUserId || !user.pin) continue;
    if (await hashService.compare(pin, user.pin)) {
      return true;
    }
  }
  return false;
}
