import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { resolveEffectivePermissions } from '../../modules/auth/domain/effective-permissions';
import { Role } from '../../modules/roles/domain/entities/role.entity';
import { User } from '../../modules/users/domain/entities/user.entity';

const ALL = '*';

/** Permisos que el `actor` no tiene entre los `required`. El propietario ('*') lo cubre todo. */
export function missingPermissions(actor: readonly string[], required: readonly string[]): string[] {
  if (actor.includes(ALL)) return [];
  const held = new Set(actor);
  return required.filter((permission) => !held.has(permission));
}

/**
 * Nadie puede conceder, ni administrar a quien tenga, más poder del que él mismo tiene: evita que
 * un usuario con permiso de editar usuarios o roles se convierta en administrador a sí mismo o
 * tome la cuenta de alguien con más privilegios (contraseña, PIN, rol).
 */
export function assertCanGrant(actor: readonly string[], required: readonly string[]): void {
  const missing = missingPermissions(actor, required);
  if (missing.length > 0) {
    throw new AppException(
      ErrorCode.PermissionEscalation,
      'No puedes otorgar ni administrar permisos que tú no tienes.',
      HttpStatus.FORBIDDEN,
      { missing },
    );
  }
}

/** Permisos efectivos de quien realiza la acción; sin usuario válido en la tienda no tiene ninguno. */
export async function loadActorPermissions(manager: EntityManager, tenantId: string, actorId: string | undefined): Promise<string[]> {
  if (!actorId) return [];
  const actor = await manager.getRepository(User).findOne({ where: { id: actorId, tenantId }, relations: { roleEntity: true } });
  return actor ? resolveEffectivePermissions(actor) : [];
}

/** Permisos efectivos de un usuario a partir de su rol (leído de la base) y sus permisos personalizados. */
export async function loadEffectivePermissionsOf(
  manager: EntityManager,
  user: { isOwner: boolean; roleId?: string | null; customPermissions?: string[] | null },
  tenantId: string,
): Promise<string[]> {
  const role = user.roleId ? await manager.getRepository(Role).findOne({ where: { id: user.roleId, tenantId } }) : null;
  return resolveEffectivePermissions({ isOwner: user.isOwner, roleEntity: role, customPermissions: user.customPermissions });
}
