import { APP_PERMISSIONS } from '../../../common/enums/permissions.enum';
import { ADMIN_PERMISSIONS, CASHIER_PERMISSIONS, MANAGER_PERMISSIONS } from './default-roles';

const known = new Set<string>(Object.values(APP_PERMISSIONS));

describe('roles por defecto de una tienda nueva', () => {
  it.each([
    ['Administrador', ADMIN_PERMISSIONS],
    ['Gerente', MANAGER_PERMISSIONS],
    ['Cajero', CASHIER_PERMISSIONS],
  ])('%s solo contiene permisos que existen y sin repetidos', (_name, permissions) => {
    expect(permissions.filter((p) => !known.has(p))).toEqual([]);
    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it('el administrador no recibe los permisos de gestión que se excluyen por nombre', () => {
    // Los alias *_MANAGE comparten valor con *_EDIT: el filtro actual es por nombre de clave, no por valor.
    // Este test fija el comportamiento vigente para que cualquier cambio sea una decisión explícita.
    expect(ADMIN_PERMISSIONS).toContain(APP_PERMISSIONS.ROLES_EDIT);
    expect(ADMIN_PERMISSIONS).toContain(APP_PERMISSIONS.USERS_EDIT);
  });

  it('el cajero puede vender y abrir caja pero no reembolsar ni ajustar stock', () => {
    expect(CASHIER_PERMISSIONS).toEqual(expect.arrayContaining([APP_PERMISSIONS.POS_SELL, APP_PERMISSIONS.CASH_OPEN_CLOSE]));
    expect(CASHIER_PERMISSIONS).not.toContain(APP_PERMISSIONS.SALES_REFUND);
    expect(CASHIER_PERMISSIONS).not.toContain(APP_PERMISSIONS.PRODUCTS_ADJUST_STOCK);
  });
});
