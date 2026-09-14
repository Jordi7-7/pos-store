import { SetMetadata } from '@nestjs/common';
import { AppPermission } from '../../../common/enums/permissions.enum';

export const PERMISSIONS_KEY = 'permissions';
export const REQUIRE_ANY_PERMISSIONS_KEY = 'require_any_permissions';

export const RequirePermissions = (...permissions: AppPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAnyPermissions = (...permissions: AppPermission[]) =>
  SetMetadata(REQUIRE_ANY_PERMISSIONS_KEY, permissions);

