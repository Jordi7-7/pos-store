import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import { PERMISSIONS_KEY, REQUIRE_ANY_PERMISSIONS_KEY } from '../../modules/auth/decorators/permissions.decorator';
import { HealthController } from '../health/health.controller';
import { AuthController } from '../../modules/auth/infrastructure/controllers/auth.controller';
import { BatchesController } from '../../modules/batches/infrastructure/controllers/batches.controller';
import { BranchesController } from '../../modules/branches/infrastructure/controllers/branches.controller';
import { CustomersController } from '../../modules/customers/infrastructure/controllers/customers.controller';
import { DashboardController } from '../../modules/dashboard/infrastructure/controllers/dashboard.controller';
import { MediaController } from '../../modules/media/infrastructure/controllers/media.controller';
import { ProductsController } from '../../modules/products/infrastructure/controllers/products.controller';
import { PurchasesController } from '../../modules/purchases/infrastructure/controllers/purchases.controller';
import { ReportsController } from '../../modules/reports/infrastructure/controllers/reports.controller';
import { RolesController } from '../../modules/roles/infrastructure/controllers/roles.controller';
import { CashRegistersController } from '../../modules/sales/infrastructure/controllers/cash-registers.controller';
import { SalesController } from '../../modules/sales/infrastructure/controllers/sales.controller';
import { TenantsController } from '../../modules/tenants/infrastructure/controllers/tenants.controller';
import { UsersController } from '../../modules/users/infrastructure/controllers/users.controller';

type ControllerClass = new (...args: never[]) => object;

/**
 * Endpoints que a propósito solo exigen estar autenticado (sin permiso concreto).
 * Cualquier endpoint nuevo debe declarar @Public(), @RequirePermissions/@RequireAnyPermissions
 * o añadirse aquí con una justificación.
 */
const AUTHENTICATED_ONLY: ReadonlySet<string> = new Set([
  'AuthController.getProfile', // datos del propio usuario
]);

const CONTROLLERS: readonly ControllerClass[] = [
  AuthController,
  BatchesController,
  BranchesController,
  CustomersController,
  DashboardController,
  HealthController,
  MediaController,
  ProductsController,
  PurchasesController,
  ReportsController,
  RolesController,
  CashRegistersController,
  SalesController,
  TenantsController,
  UsersController,
];

interface Route {
  id: string;
  label: string;
  isPublic: boolean;
  hasPermission: boolean;
}

function collectRoutes(controller: ControllerClass): Route[] {
  const proto = controller.prototype as Record<string, unknown>;
  const classHasPermission =
    Reflect.getMetadata(PERMISSIONS_KEY, controller) !== undefined ||
    Reflect.getMetadata(REQUIRE_ANY_PERMISSIONS_KEY, controller) !== undefined;
  const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;

  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
    .filter((name) => Reflect.getMetadata(METHOD_METADATA, proto[name] as object) !== undefined)
    .map((name) => {
      const handler = proto[name] as object;
      const verb = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
      const path = String(Reflect.getMetadata(PATH_METADATA, handler));
      return {
        id: `${controller.name}.${name}`,
        label: `${verb} ${controller.name}/${path} (${name})`,
        isPublic: classIsPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
        hasPermission:
          classHasPermission ||
          Reflect.getMetadata(PERMISSIONS_KEY, handler) !== undefined ||
          Reflect.getMetadata(REQUIRE_ANY_PERMISSIONS_KEY, handler) !== undefined,
      };
    });
}

describe('Control de acceso de endpoints', () => {
  const routes = CONTROLLERS.flatMap(collectRoutes);

  it('descubre endpoints (el test no está vacío)', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('todo endpoint es público, exige un permiso o está en la lista de excepciones', () => {
    const unprotected = routes
      .filter((route) => !route.isPublic && !route.hasPermission && !AUTHENTICATED_ONLY.has(route.id))
      .map((route) => route.label);

    expect(unprotected).toEqual([]);
  });

  it('la lista de excepciones no contiene entradas obsoletas', () => {
    const ids = new Set(routes.map((route) => route.id));
    const stale = [...AUTHENTICATED_ONLY].filter((id) => !ids.has(id));

    expect(stale).toEqual([]);
  });

  it('los únicos endpoints públicos son los esperados', () => {
    const publicRoutes = routes.filter((route) => route.isPublic).map((route) => route.id).sort();

    expect(publicRoutes).toEqual(
      [
        'AuthController.login',
        'AuthController.logout',
        'AuthController.onboard',
        'AuthController.pinLogin',
        'AuthController.refresh',
        'HealthController.check',
        'TenantsController.getPublicBySlug',
      ].sort(),
    );
  });
});
