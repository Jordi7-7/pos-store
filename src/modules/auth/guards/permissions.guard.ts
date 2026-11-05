import { CanActivate, ExecutionContext, Injectable, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, REQUIRE_ANY_PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AppPermission } from '../../../common/enums/permissions.enum';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuthenticatedRequest } from '../interfaces/authenticated-request';
import { meetsRequirement } from '../domain/permission-check';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const all = this.reflector.getAllAndOverride<AppPermission[] | undefined>(PERMISSIONS_KEY, targets);
    const any = this.reflector.getAllAndOverride<AppPermission[] | undefined>(REQUIRE_ANY_PERMISSIONS_KEY, targets);

    if (!all?.length && !any?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new AppException(ErrorCode.UserNotAuthenticated, 'Usuario no autenticado.', HttpStatus.FORBIDDEN);
    }

    if (!meetsRequirement(user, { all, any })) {
      throw new AppException(
        ErrorCode.PermissionDenied,
        'No tienes permisos suficientes para realizar esta acción.',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
