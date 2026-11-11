import { DEFAULT_CATALOG_PAGE, MAX_CATALOG_PAGE, formatPosCatalogCursor, parseCatalogPageSize, parsePosCatalogCursor } from './pos-catalog-cursor';

const ID = '3f1d6b1e-6c1a-4f0e-9d3a-2b6f0a7c1e11';
const AT = '2026-11-10T15:30:00.123456Z';

describe('cursor del catálogo del POS', () => {
  it('ida y vuelta: conserva los microsegundos', () => {
    expect(parsePosCatalogCursor(formatPosCatalogCursor({ changedAt: AT, id: ID }))).toEqual({ changedAt: AT, id: ID });
  });

  it('sin cursor o con un formato inválido devuelve null (primera descarga)', () => {
    for (const raw of [undefined, null, '', 'hola', `${AT}`, `2026-11-10T15:30:00.123Z|${ID}`, `${AT}|no-es-uuid`]) {
      expect(parsePosCatalogCursor(raw)).toBeNull();
    }
  });

  it('el id se normaliza a minúsculas y se ignoran los espacios', () => {
    expect(parsePosCatalogCursor(` ${AT}|${ID.toUpperCase()} `)).toEqual({ changedAt: AT, id: ID });
  });
});

describe('parseCatalogPageSize', () => {
  it('usa el tamaño por defecto si falta o es inválido y acota el máximo', () => {
    expect(parseCatalogPageSize(undefined)).toBe(DEFAULT_CATALOG_PAGE);
    expect(parseCatalogPageSize('abc')).toBe(DEFAULT_CATALOG_PAGE);
    expect(parseCatalogPageSize(0)).toBe(DEFAULT_CATALOG_PAGE);
    expect(parseCatalogPageSize('50')).toBe(50);
    expect(parseCatalogPageSize(99999)).toBe(MAX_CATALOG_PAGE);
  });
});
