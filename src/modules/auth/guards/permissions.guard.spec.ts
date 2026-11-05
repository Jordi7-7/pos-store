import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_PERMISSIONS } from '../../../common/enums/permissions.enum';
import {
  PERMISSIONS_KEY,
  REQUIRE_ANY_PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

interface FakeUser {
  isOwner?: boolean;
  permissions?: string[];
}

function buildContext(user: FakeUser | undefined): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildGuard(metadata: {
  all?: string[];
  any?: string[];
}): PermissionsGuard {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === PERMISSIONS_KEY
        ? metadata.all
        : key === REQUIRE_ANY_PERMISSIONS_KEY
          ? metadata.any
          : undefined,
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  it('permite el acceso cuando la ruta no exige permisos', () => {
    expect(buildGuard({}).canActivate(buildContext(undefined))).toBe(true);
  });

  it('lanza Forbidden si la ruta exige permisos y no hay usuario', () => {
    const guard = buildGuard({ all: [APP_PERMISSIONS.VIEW_POS] });
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('el propietario tiene acceso total', () => {
    const guard = buildGuard({ all: [APP_PERMISSIONS.VIEW_POS] });
    expect(
      guard.canActivate(buildContext({ isOwner: true, permissions: [] })),
    ).toBe(true);
  });

  it("el comodín '*' en el token da acceso total", () => {
    const guard = buildGuard({ all: [APP_PERMISSIONS.VIEW_POS] });
    expect(guard.canActivate(buildContext({ permissions: ['*'] }))).toBe(true);
  });

  it('exige TODOS los permisos de RequirePermissions', () => {
    const guard = buildGuard({
      all: [APP_PERMISSIONS.VIEW_POS, APP_PERMISSIONS.VIEW_DASHBOARD],
    });

    expect(() =>
      guard.canActivate(
        buildContext({ permissions: [APP_PERMISSIONS.VIEW_POS] }),
      ),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        buildContext({
          permissions: [
            APP_PERMISSIONS.VIEW_POS,
            APP_PERMISSIONS.VIEW_DASHBOARD,
          ],
        }),
      ),
    ).toBe(true);
  });

  it('exige AL MENOS UNO de RequireAnyPermissions', () => {
    const guard = buildGuard({
      any: [APP_PERMISSIONS.VIEW_POS, APP_PERMISSIONS.VIEW_DASHBOARD],
    });

    expect(() => guard.canActivate(buildContext({ permissions: [] }))).toThrow(
      ForbiddenException,
    );
    expect(
      guard.canActivate(
        buildContext({ permissions: [APP_PERMISSIONS.VIEW_DASHBOARD] }),
      ),
    ).toBe(true);
  });
});
