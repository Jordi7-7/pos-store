import { HttpStatus } from '@nestjs/common';
import { APP_PERMISSIONS } from '../enums/permissions.enum';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

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
    throw new AppException(ErrorCode.InvalidPermissions, `Permisos no válidos: ${invalid.join(', ')}`, HttpStatus.BAD_REQUEST, { invalid });
  }
  return Array.from(new Set(permissions));
}
