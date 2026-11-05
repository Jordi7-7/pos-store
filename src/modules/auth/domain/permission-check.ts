import { OWNER_PERMISSIONS } from './effective-permissions';

export interface PermissionHolder {
  isOwner?: boolean;
  permissions?: readonly string[] | null;
}

export interface PermissionRequirement {
  /** El usuario debe tener todos estos permisos. */
  all?: readonly string[];
  /** El usuario debe tener al menos uno de estos permisos. */
  any?: readonly string[];
}

const WILDCARD = OWNER_PERMISSIONS[0];

/** El propietario y los tokens con el comodín '*' tienen acceso total. */
export function hasFullAccess(user: PermissionHolder): boolean {
  return user.isOwner === true || (user.permissions?.includes(WILDCARD) ?? false);
}

/** Cumple las reglas `all` y `any` a la vez; una regla vacía o ausente no restringe. */
export function meetsRequirement(user: PermissionHolder, requirement: PermissionRequirement): boolean {
  if (hasFullAccess(user)) {
    return true;
  }
  const granted = user.permissions ?? [];
  const hasAll = (requirement.all ?? []).every((permission) => granted.includes(permission));
  const anyRequired = requirement.any ?? [];
  const hasAny = anyRequired.length === 0 || anyRequired.some((permission) => granted.includes(permission));
  return hasAll && hasAny;
}
