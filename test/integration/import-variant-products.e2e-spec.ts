import { DataSource } from 'typeorm';
import { ImportVariantProductsCommand } from '../../src/modules/products/application/commands/import-variant-products/import-variant-products.command';
import { ImportVariantProductsHandler } from '../../src/modules/products/application/commands/import-variant-products/import-variant-products.handler';
import { Attribute } from '../../src/modules/products/domain/entities/attribute.entity';
import { Category } from '../../src/modules/products/domain/entities/category.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { ImportRow } from '../../src/modules/products/domain/import-plan';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Importación masiva por variantes con los handlers reales sobre Postgres. */
describe('Importación de productos con variantes', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let cashierId: string;

  let line = 1;
  const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
    row: ++line,
    name: 'Playera',
    baseSku: 'PLY',
    category: 'Ropa',
    attributes: [{ name: 'Talla', value: 'M' }],
    sku: `PLY-${line}`,
    barcode: '',
    purchasePrice: 5,
    salePrice: 12,
    wholesalePrice: null,
    quantity: 3,
    ...overrides,
  });
  const run = (rows: ImportRow[], options: { dryRun?: boolean; branchId?: string | null; userId?: string; tenant?: SeededTenant } = {}) => {
    const tenant = options.tenant ?? shop;
    return new ImportVariantProductsHandler(db.manager, redisStub).execute(
      new ImportVariantProductsCommand(tenant.tenantId, options.userId ?? tenant.ownerId, options.branchId === null ? undefined : (options.branchId ?? tenant.branchId), options.dryRun ?? false, rows),
    );
  };
  const countProducts = (tenant = shop) => db.getRepository(Product).countBy({ tenantId: tenant.tenantId });
  const stockOf = async (sku: string): Promise<number> => {
    const variant = await db.getRepository(ProductVariant).findOneByOrFail({ sku, tenantId: shop.tenantId });
    const stock = await db.getRepository(ProductStock).findOneBy({ variantId: variant.id, branchId: shop.branchId });
    return stock ? Number(stock.quantity) : 0;
  };

  beforeAll(async () => {
    database = await startTestDatabase('import-variants');
    db = database.db;
    shop = await seedTenant(db, 'import-var');
    other = await seedTenant(db, 'import-var-ajena');
    cashierId = (await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-imp', password: 'x', isOwner: false }))).id;
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('validar no escribe nada y cuenta lo que se crearía, incluidas categorías y atributos nuevos', async () => {
    const before = await countProducts();
    const report = await run(
      [
        row({ baseSku: 'VAL', sku: 'VAL-M', attributes: [{ name: 'Talla', value: 'M' }, { name: 'Color', value: 'Negro' }] }),
        row({ baseSku: 'VAL', sku: 'VAL-L', attributes: [{ name: 'Talla', value: 'L' }, { name: 'Color', value: 'Negro' }], quantity: 4 }),
        row({ baseSku: '', sku: 'VAL-SIMPLE', name: 'Tornillo', category: '', attributes: [] }),
      ],
      { dryRun: true },
    );

    expect(report).toMatchObject({ valid: true, applied: false, errors: [], summary: { products: 2, variants: 3, units: 10, newCategories: ['Ropa'], newAttributes: ['Talla', 'Color'], newAttributeValues: 3 } });
    expect(await countProducts()).toBe(before);
    expect(await db.getRepository(Category).countBy({ tenantId: shop.tenantId, name: 'Ropa' })).toBe(0);
  });

  it('importa productos con variantes y simples, con categoría, atributos y existencias en la sucursal', async () => {
    const report = await run([
      row({ baseSku: 'IMP', sku: 'imp-m-neg', attributes: [{ name: 'Talla', value: 'M' }, { name: 'Color', value: 'Negro' }], quantity: 7, wholesalePrice: 10 }),
      row({ baseSku: 'IMP', sku: 'IMP-L-NEG', attributes: [{ name: 'Talla', value: 'L' }, { name: 'Color', value: 'Negro' }], quantity: 2 }),
      row({ baseSku: '', sku: 'IMP-SIMPLE', name: 'Tornillo', category: 'Ferretería', attributes: [], quantity: 50 }),
    ]);

    expect(report).toMatchObject({ valid: true, applied: true, summary: { products: 2, variants: 3 } });
    const product = await db.getRepository(Product).findOneOrFail({ where: { tenantId: shop.tenantId, baseSku: 'IMP' }, relations: { variants: { attributeValues: { attribute: true } }, category: true } });
    expect(product).toMatchObject({ name: 'Playera', type: 'VARIABLE', category: { name: 'Ropa' } });
    expect(product.variants.map((variant) => variant.sku).sort()).toEqual(['IMP-L-NEG', 'IMP-M-NEG']);
    expect(product.variants.find((variant) => variant.sku === 'IMP-M-NEG')).toMatchObject({ wholesalePrice: 10 });
    expect(product.variants[0]?.attributeValues.map((value) => value.attribute.name).sort()).toEqual(['Color', 'Talla']);
    expect(await stockOf('IMP-M-NEG')).toBe(7);
    expect(await stockOf('IMP-SIMPLE')).toBe(50);
    expect(await db.getRepository(Product).findOneByOrFail({ tenantId: shop.tenantId, baseSku: 'IMP-SIMPLE' })).toMatchObject({ type: 'SIMPLE' });
  });

  it('reutiliza atributos, valores y categorías que ya existen aunque cambien las mayúsculas', async () => {
    const attributesBefore = await db.getRepository(Attribute).countBy({ tenantId: shop.tenantId });
    const categoriesBefore = await db.getRepository(Category).countBy({ tenantId: shop.tenantId });

    const report = await run([row({ baseSku: 'REU', sku: 'REU-1', category: 'ROPA', attributes: [{ name: 'talla', value: 'm' }, { name: 'COLOR', value: 'negro' }] })], { dryRun: true });

    expect(report.summary).toMatchObject({ newCategories: [], newAttributes: [], newAttributeValues: 0 });
    await run([row({ baseSku: 'REU', sku: 'REU-1', category: 'ROPA', attributes: [{ name: 'talla', value: 'm' }, { name: 'COLOR', value: 'negro' }] })]);
    expect(await db.getRepository(Attribute).countBy({ tenantId: shop.tenantId })).toBe(attributesBefore);
    expect(await db.getRepository(Category).countBy({ tenantId: shop.tenantId })).toBe(categoriesBefore);
  });

  it('un archivo con errores devuelve TODOS, por fila, y al importar no se crea nada', async () => {
    const before = await countProducts();
    const rows = [
      row({ baseSku: 'ERR', sku: 'ERR-1', salePrice: null }),
      row({ baseSku: 'ERR', sku: 'IMP-M-NEG', attributes: [{ name: 'Talla', value: 'L' }] }),
      row({ baseSku: 'IMP', sku: 'ERR-3', attributes: [{ name: 'Talla', value: 'XL' }] }),
    ];

    const report = await run(rows, { dryRun: true });

    expect(report.valid).toBe(false);
    expect(report.errors.map((error) => [error.row, error.field])).toEqual([[rows[0]?.row, 'salePrice'], [rows[1]?.row, 'sku'], [rows[2]?.row, 'baseSku']]);
    await expect(run(rows)).rejects.toMatchObject({ code: 'IMPORT_INVALID', details: { total: 3 } });
    expect(await countProducts()).toBe(before);
  });

  it('un SKU de otra tienda no cuenta como repetido', async () => {
    await run([row({ baseSku: 'AJENO', sku: 'AJENO-1', attributes: [] })], { tenant: other });

    await expect(run([row({ baseSku: '', sku: 'AJENO-1', name: 'Mío', attributes: [] })])).resolves.toMatchObject({ applied: true });
  });

  it('con existencias y sin sucursal se rechaza; sin existencias no hace falta sucursal', async () => {
    const withStock = await run([row({ baseSku: 'SIN', sku: 'SIN-1' })], { dryRun: true, branchId: null });
    expect(withStock.errors).toEqual([expect.objectContaining({ field: 'quantity' })]);

    await expect(run([row({ baseSku: 'SIN', sku: 'SIN-2', quantity: 0 })], { branchId: null })).resolves.toMatchObject({ applied: true });
  });

  it('es todo o nada: si falla un producto a mitad de camino, el anterior tampoco queda guardado', async () => {
    const before = await countProducts();

    await expect(
      run([
        row({ baseSku: 'ATO', sku: 'ATO-1', name: 'Primero', attributes: [] }),
        // Pasa la validación pero la base de datos no admite una existencia de ese tamaño (numeric(10,2))
        row({ baseSku: '', sku: 'ATO-2', name: 'Segundo', attributes: [], quantity: 99999999999 }),
      ]),
    ).rejects.toBeDefined();

    expect(await countProducts()).toBe(before);
    expect(await db.getRepository(ProductVariant).countBy({ tenantId: shop.tenantId, sku: 'ATO-1' })).toBe(0);
  });

  it('quien no tiene asignada la sucursal no puede importar a ella, y sin filas o con demasiadas se rechaza', async () => {
    await expect(run([row({ baseSku: 'PER', sku: 'PER-1' })], { userId: cashierId })).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
    await expect(run([])).rejects.toMatchObject({ code: 'IMPORT_EMPTY' });
    await expect(run(Array.from({ length: 2001 }, (_, index) => row({ sku: `MAX-${index}` })))).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED' });
  });

  it('una fila con cinco atributos (cuatro piezas de color y el cierre) crea la variante con los cinco', async () => {
    const pieces = ['Frente', 'Bolsillo', 'Laterales', 'Base', 'Cierre'];
    const backpack = (sku: string, zip: string) =>
      row({ name: 'Mochila combinada', baseSku: 'MC', sku, attributes: pieces.map((name) => ({ name, value: name === 'Cierre' ? zip : 'Negro' })) });

    const report = await run([backpack('MC-001', 'Negro'), backpack('MC-002', 'Rojo')]);

    expect(report).toMatchObject({ valid: true, applied: true });
    const variant = await db.getRepository(ProductVariant).findOneOrFail({ where: { sku: 'MC-002', tenantId: shop.tenantId }, relations: { attributeValues: { attribute: true } } });
    expect(variant.attributeValues.map((value) => `${value.attribute.name}: ${value.value}`).sort()).toEqual(['Base: Negro', 'Bolsillo: Negro', 'Cierre: Rojo', 'Frente: Negro', 'Laterales: Negro']);
  });
});
