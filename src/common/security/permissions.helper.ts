import { BadRequestException } from '@nestjs/common';
import { APP_PERMISSIONS } from '../enums/permissions.enum';

const VALID_PERMISSIONS: ReadonlySet<string> = new Set(
  Object.values(APP_PERMISSIONS),
);

/**
 * Valida que cada permiso pertenezca al catálogo `APP_PERMISSIONS`.
 * Rechaza el comodín '*' y cualquier cadena desconocida, para evitar escalada
 * de privilegios al crear/editar roles o permisos personalizados de usuario.
 * Devuelve la lista sin duplicados.
 */
export function assertValidPermissions(
  permissions: readonly string[],
): string[] {
  const invalid = permissions.filter(
    (permission) => !VALID_PERMISSIONS.has(permission),
  );
  if (invalid.length > 0) {
    throw new BadRequestException(`Permisos no válidos: ${invalid.join(', ')}`);
  }
  return Array.from(new Set(permissions));
}
