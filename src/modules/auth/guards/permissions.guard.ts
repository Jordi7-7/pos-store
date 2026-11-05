import { CanActivate, ExecutionContext, Injectable, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, REQUIRE_ANY_PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AppPermission } from '../../../common/enums/permissions.enum';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<AppPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requireAnyPermissions = this.reflector.getAllAndOverride<AppPermission[]>(REQUIRE_ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!requireAnyPermissions || requireAnyPermissions.length === 0)
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new AppException(ErrorCode.UserNotAuthenticated, 'Usuario no autenticado.', HttpStatus.FORBIDDEN);
    }

    // El Propietario (OWNER/isOwner) o roles con comodín '*' tienen acceso total automático
    if (user.isOwner === true || (Array.isArray(user.permissions) && user.permissions.includes('*'))) {
      return true;
    }

    const userPermissions: string[] = Array.isArray(user.permissions) ? user.permissions : [];

    // Verificar si el usuario cumple con la regla ALL (RequirePermissions)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));
      if (!hasAll) {
        throw new AppException(ErrorCode.PermissionDenied, 'No tienes permisos suficientes para realizar esta acción.', HttpStatus.FORBIDDEN);
      }
    }

    // Verificar si el usuario cumple con la regla ANY (RequireAnyPermissions)
    if (requireAnyPermissions && requireAnyPermissions.length > 0) {
      const hasAny = requireAnyPermissions.some((perm) => userPermissions.includes(perm));
      if (!hasAny) {
        throw new AppException(ErrorCode.PermissionDenied, 'No tienes permisos suficientes para realizar esta acción.', HttpStatus.FORBIDDEN);
      }
    }

    return true;
  }
}
