import { BadRequestException } from '@nestjs/common';
import { APP_PERMISSIONS } from '../enums/permissions.enum';
import { assertValidPermissions } from './permissions.helper';

describe('assertValidPermissions', () => {
  it('acepta permisos del catálogo y elimina duplicados', () => {
    const result = assertValidPermissions([
      APP_PERMISSIONS.VIEW_POS,
      APP_PERMISSIONS.VIEW_POS,
      APP_PERMISSIONS.VIEW_DASHBOARD,
    ]);

    expect(result).toEqual([
      APP_PERMISSIONS.VIEW_POS,
      APP_PERMISSIONS.VIEW_DASHBOARD,
    ]);
  });

  it('acepta una lista vacía', () => {
    expect(assertValidPermissions([])).toEqual([]);
  });

  it("rechaza el comodín '*' (escalada de privilegios)", () => {
    expect(() => assertValidPermissions(['*'])).toThrow(BadRequestException);
  });

  it('rechaza permisos desconocidos e indica cuáles son', () => {
    expect(() =>
      assertValidPermissions([APP_PERMISSIONS.VIEW_POS, 'hack:everything']),
    ).toThrow(/hack:everything/);
  });
});
