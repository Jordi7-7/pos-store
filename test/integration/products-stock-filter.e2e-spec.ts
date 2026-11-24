import { DataSource } from 'typeorm';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { GetProductsHandler } from '../../src/modules/products/application/queries/get-products/get-products.handler';
import { GetProductsQuery } from '../../src/modules/products/application/queries/get-products/get-products.query';
import { StockStatus } from '../../src/modules/products/domain/enums/stock-status.enum';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * Filtro del listado de productos por existencias: con existencias, en cero y en negativo. Se resuelve en la base de datos,
 * así que funciona con la paginación. Una variante sin fila de stock cuenta como cero; las variantes borradas no cuentan.
 */
describe('Listado de productos: filtro por existencias', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let norte: string;

  const setStock = (branchId: string, variantId: string, quantity: number) => db.getRepository(ProductStock).save({ branchId, variantId, quantity });

  /** Un producto con una o varias variantes (`stocks`: una existencia por variante en Matriz; `null` = sin fila de stock). */
  const productWith = async (name: string, variants: Array<number | null>): Promise<string[]> => {
    const product = await db.getRepository(Product).save(db.getRepository(Product).create({ tenantId: shop.tenantId, name, description: name }));
    const ids: string[] = [];
    for (const [index, quantity] of variants.entries()) {
      const variant = await db.getRepository(ProductVariant).save(
        db.getRepository(ProductVariant).create({ productId: product.id, tenantId: shop.tenantId, sku: `${name}-${index}`, barcode: `${name}-${index}`, purchasePrice: 4, salePrice: 10 }),
      );
      if (quantity !== null) await setStock(shop.branchId, variant.id, quantity);
      ids.push(variant.id);
    }
    return ids;
  };

  const names = async (status: StockStatus | undefined, branchId?: string, extra: { page?: number; limit?: number } = {}) => {
    const result = await new GetProductsHandler(db.manager).execute(new GetProductsQuery(shop.tenantId, extra.page ?? 1, extra.limit ?? 50, undefined, undefined, branchId, status));
    return { names: result.data.map((p) => p.name).sort(), total: result.meta.total };
  };

  beforeAll(async () => {
    database = await startTestDatabase('stock-filter');
    db = database.db;
    shop = await seedTenant(db, 'filtro');
    other = await seedTenant(db, 'filtro-ajena');
    norte = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;

    await productWith('P-CON', [5]);
    await productWith('P-CERO', [0]);
    await productWith('P-SIN-FILA', [null]);
    await productWith('P-NEG', [-2]);
    await productWith('P-MIXTO', [3, -1]); // una variante con stock y otra en negativo
    const [onlyNorth] = await productWith('P-SOLO-NORTE', [null]);
    await setStock(norte, onlyNorth, 4);
    const [liveZero, deleted] = await productWith('P-VARIANTE-BORRADA', [0, 9]);
    await db.getRepository(ProductVariant).softDelete(deleted);
    expect(liveZero).toBeTruthy();

    // De otra tienda: no debe aparecer en ningún estado
    const foreign = await seedVariant(db, other.tenantId, 'AJENO-NEG');
    await db.getRepository(ProductStock).save({ branchId: other.branchId, variantId: foreign, quantity: -7 });
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('en una sucursal (Matriz)', () => {
    it('con existencias: algún variante con más de cero; las variantes borradas no cuentan', async () => {
      expect((await names(StockStatus.IN_STOCK, shop.branchId)).names).toEqual(['P-CON', 'P-MIXTO']);
    });

    it('en negativo: alguna variante por debajo de cero', async () => {
      expect((await names(StockStatus.NEGATIVE, shop.branchId)).names).toEqual(['P-MIXTO', 'P-NEG']);
    });

    it('en cero: sin existencias ni deuda; incluye lo que no tiene fila de stock ahí y lo que solo tiene stock en otra sucursal', async () => {
      expect((await names(StockStatus.ZERO, shop.branchId)).names).toEqual(['P-CERO', 'P-SIN-FILA', 'P-SOLO-NORTE', 'P-VARIANTE-BORRADA']);
    });
  });

  describe('en otra sucursal (Norte)', () => {
    it('solo cuenta lo que hay en esa sucursal', async () => {
      expect((await names(StockStatus.IN_STOCK, norte)).names).toEqual(['P-SOLO-NORTE']);
      expect((await names(StockStatus.NEGATIVE, norte)).names).toEqual([]);
      expect((await names(StockStatus.ZERO, norte)).names).toEqual(['P-CERO', 'P-CON', 'P-MIXTO', 'P-NEG', 'P-SIN-FILA', 'P-VARIANTE-BORRADA']);
    });
  });

  describe('sin elegir sucursal (todas)', () => {
    it('mira las existencias de todas las sucursales', async () => {
      expect((await names(StockStatus.IN_STOCK)).names).toEqual(['P-CON', 'P-MIXTO', 'P-SOLO-NORTE']);
      expect((await names(StockStatus.NEGATIVE)).names).toEqual(['P-MIXTO', 'P-NEG']);
      expect((await names(StockStatus.ZERO)).names).toEqual(['P-CERO', 'P-SIN-FILA', 'P-VARIANTE-BORRADA']);
    });
  });

  it('sin filtro trae todos los productos de la tienda y ninguno de otra', async () => {
    const all = await names(undefined);
    expect(all.total).toBe(7);
    expect(all.names).not.toContain('AJENO-NEG');
  });

  it('un producto de otra tienda en negativo no aparece en el filtro de negativos', async () => {
    expect((await names(StockStatus.NEGATIVE)).names).not.toContain('AJENO-NEG');
  });

  it('el filtro se aplica antes de paginar: el total y las páginas cuentan solo lo filtrado', async () => {
    const first = await names(StockStatus.ZERO, undefined, { page: 1, limit: 2 });
    const second = await names(StockStatus.ZERO, undefined, { page: 2, limit: 2 });

    expect(first.total).toBe(3);
    expect(first.names).toHaveLength(2);
    expect(second.names).toHaveLength(1);
    expect([...first.names, ...second.names].sort()).toEqual(['P-CERO', 'P-SIN-FILA', 'P-VARIANTE-BORRADA']);
  });
});
