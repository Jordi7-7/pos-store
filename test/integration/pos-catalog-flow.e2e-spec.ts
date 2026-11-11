import { DataSource } from 'typeorm';
import { GetPosCatalogHandler } from '../../src/modules/products/application/queries/get-pos-catalog/get-pos-catalog.handler';
import { GetPosCatalogQuery } from '../../src/modules/products/application/queries/get-pos-catalog/get-pos-catalog.query';
import { PosCatalogItem, PosCatalogPage } from '../../src/modules/products/application/read-models/pos-catalog';
import { Attribute } from '../../src/modules/products/domain/entities/attribute.entity';
import { AttributeValue } from '../../src/modules/products/domain/entities/attribute-value.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { ProductType } from '../../src/modules/products/domain/enums/product-type.enum';
import { seedTenant, seedVariant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Catálogo del POS para vender sin conexión: descarga por lotes y por cambios, con los handlers reales sobre Postgres. */
describe('Catálogo del POS sin conexión', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  const variantIds: Record<string, string> = {};

  const page = (tenant: SeededTenant, after?: string, limit?: number): Promise<PosCatalogPage> =>
    new GetPosCatalogHandler(db.manager).execute(new GetPosCatalogQuery(tenant.tenantId, after, limit));

  /** Baja todo lo que haya desde `after`, página a página, como lo hace el aparato. Devuelve los ítems y el cursor final. */
  const download = async (tenant: SeededTenant, after?: string, limit = 2): Promise<{ items: PosCatalogItem[]; cursor: string | null; pages: number }> => {
    const items: PosCatalogItem[] = [];
    let cursor = after;
    let pages = 0;
    for (;;) {
      const result = await page(tenant, cursor, limit);
      pages += 1;
      items.push(...result.items);
      cursor = result.cursor ?? cursor;
      if (!result.hasMore) return { items, cursor: cursor ?? null, pages };
      if (pages > 50) throw new Error('la descarga no termina');
    }
  };

  beforeAll(async () => {
    database = await startTestDatabase('pos-catalog');
    db = database.db;
    shop = await seedTenant(db, 'catalogo');
    other = await seedTenant(db, 'catalogo-ajeno');
    for (const sku of ['CAT-1', 'CAT-2', 'CAT-3', 'CAT-4', 'CAT-5']) variantIds[sku] = await seedVariant(db, shop.tenantId, sku);
    await seedVariant(db, other.tenantId, 'AJENO-1');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('baja el catálogo completo por páginas, sin repetir ni perder variantes, con lo necesario para escanear y vender', async () => {
    const { items, pages } = await download(shop, undefined, 2);

    expect(items.map((i) => i.sku).sort()).toEqual(['CAT-1', 'CAT-2', 'CAT-3', 'CAT-4', 'CAT-5']);
    expect(pages).toBe(3);
    expect(items[0]).toEqual(
      expect.objectContaining({ id: expect.any(String) as string, sku: expect.any(String) as string, barcode: expect.any(String) as string, productName: expect.any(String) as string, productType: ProductType.SIMPLE, salePrice: 10, deleted: false }),
    );
    expect(items[0]).not.toHaveProperty('stock');
  });

  it('nunca incluye variantes de otra tienda', async () => {
    const { items } = await download(shop, undefined, 100);

    expect(items.some((i) => i.sku === 'AJENO-1')).toBe(false);
    expect((await download(other, undefined, 100)).items.map((i) => i.sku)).toEqual(['AJENO-1']);
  });

  it('un producto variable trae sus atributos (id y nombre del atributo y del valor) y su SKU base', async () => {
    const product = await db.getRepository(Product).save(
      db.getRepository(Product).create({ tenantId: shop.tenantId, name: 'CAMISA', description: 'x', type: ProductType.VARIABLE, baseSku: 'CAMISA' }),
    );
    const attribute = await db.getRepository(Attribute).save(db.getRepository(Attribute).create({ tenantId: shop.tenantId, name: 'Talla' }));
    const medium = await db.getRepository(AttributeValue).save(db.getRepository(AttributeValue).create({ attributeId: attribute.id, value: 'M' }));
    const variant = await db.getRepository(ProductVariant).save(
      db.getRepository(ProductVariant).create({ productId: product.id, tenantId: shop.tenantId, sku: 'CAMISA-M', barcode: 'CAMISA-M', purchasePrice: 5, salePrice: 12, attributeValues: [medium] }),
    );

    const { items } = await download(shop, undefined, 100);

    expect(items.find((i) => i.id === variant.id)).toMatchObject({
      productType: ProductType.VARIABLE,
      baseSku: 'CAMISA',
      salePrice: 12,
      attributes: [{ attributeId: attribute.id, attributeName: 'Talla', valueId: medium.id, valueName: 'M' }],
    });
  });

  describe('descarga por cambios', () => {
    it('sin cambios no trae nada y conserva el cursor', async () => {
      const full = await download(shop, undefined, 100);

      const delta = await page(shop, full.cursor as string, 100);

      expect(delta.items).toEqual([]);
      expect(delta.hasMore).toBe(false);
      expect(delta.cursor).toBe(full.cursor);
    });

    it('un cambio de precio, renombrar el producto y borrar una variante llegan en la siguiente descarga', async () => {
      const before = await download(shop, undefined, 100);
      await db.getRepository(ProductVariant).update(variantIds['CAT-1'], { salePrice: 99 });
      const renamed = await db.getRepository(ProductVariant).findOneByOrFail({ id: variantIds['CAT-2'] });
      await db.getRepository(Product).update(renamed.productId, { name: 'NOMBRE NUEVO' });
      await db.getRepository(ProductVariant).softDelete(variantIds['CAT-3']);

      const delta = await download(shop, before.cursor as string, 100);

      const bySku = Object.fromEntries(delta.items.map((i) => [i.sku, i]));
      expect(Object.keys(bySku).sort()).toEqual(['CAT-1', 'CAT-2', 'CAT-3']);
      expect(bySku['CAT-1']).toMatchObject({ salePrice: 99, deleted: false });
      expect(bySku['CAT-2']).toMatchObject({ productName: 'NOMBRE NUEVO', deleted: false });
      expect(bySku['CAT-3']).toMatchObject({ deleted: true });
      expect(delta.cursor).not.toBe(before.cursor);
    });

    it('miles de filas con la misma fecha de cambio (importación masiva) se paginan sin repetirse ni quedarse en bucle', async () => {
      await db.query(`UPDATE product_variants SET updated_at = '2026-01-01T10:00:00.123456Z' WHERE tenant_id = $1`, [shop.tenantId]);
      await db.query(`UPDATE products SET updated_at = '2026-01-01T09:00:00Z' WHERE tenant_id = $1`, [shop.tenantId]);

      const { items, pages } = await download(shop, undefined, 2);

      const ids = items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(5);
      expect(pages).toBeLessThanOrEqual(Math.ceil(ids.length / 2) + 1);
    });
  });

  it('un cursor con formato inválido se trata como primera descarga', async () => {
    const result = await download(shop, 'cursor-roto', 100);

    expect(result.items.length).toBeGreaterThanOrEqual(5);
  });
});
