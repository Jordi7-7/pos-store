export const OWNER_PERMISSIONS: readonly string[] = ['*'];

export interface PermissionSubject {
  isOwner: boolean;
  roleEntity?: { permissions?: string[] | null } | null;
  customPermissions?: string[] | null;
}

/**
 * Permisos con los que opera un usuario: el propietario lo puede todo ('*'); el resto, la unión
 * de los permisos de su rol y los personalizados.
 */
export function resolveEffectivePermissions(user: PermissionSubject): string[] {
  if (user.isOwner) {
    return [...OWNER_PERMISSIONS];
  }
  const fromRole = user.roleEntity?.permissions ?? [];
  const custom = user.customPermissions ?? [];
  return Array.from(new Set([...fromRole, ...custom]));
}
