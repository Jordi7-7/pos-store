import { CanActivate, ExecutionContext, Injectable, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new AppException(ErrorCode.PermissionDenied, 'No tienes permisos suficientes para realizar esta acción.', HttpStatus.FORBIDDEN);
    }
    if (user.isOwner === true) {
      return true;
    }
    if (!requiredRoles.includes(user.role)) {
      throw new AppException(ErrorCode.PermissionDenied, 'No tienes permisos suficientes para realizar esta acción.', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
