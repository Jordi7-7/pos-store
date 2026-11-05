import { DataSource } from 'typeorm';
import { CreateAttributeCommand } from '../../src/modules/products/application/commands/create-attribute/create-attribute.command';
import { CreateAttributeHandler } from '../../src/modules/products/application/commands/create-attribute/create-attribute.handler';
import { CreateAttributeValueCommand } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.command';
import { CreateAttributeValueHandler } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.handler';
import { CreateSimpleProductCommand } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.command';
import { CreateSimpleProductHandler } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.handler';
import { CreateVariableProductCommand } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.command';
import { CreateVariableProductHandler } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.handler';
import { DeleteProductCommand } from '../../src/modules/products/application/commands/delete-product/delete-product.command';
import { DeleteProductHandler } from '../../src/modules/products/application/commands/delete-product/delete-product.handler';
import { GetPosVariantBySkuHandler } from '../../src/modules/products/application/queries/get-pos-variant-by-sku/get-pos-variant-by-sku.handler';
import { GetPosVariantBySkuQuery } from '../../src/modules/products/application/queries/get-pos-variant-by-sku/get-pos-variant-by-sku.query';
import { GetPosVariantsHandler } from '../../src/modules/products/application/queries/get-pos-variants/get-pos-variants.handler';
import { GetPosVariantsQuery } from '../../src/modules/products/application/queries/get-pos-variants/get-pos-variants.query';
import { GetPosVariantsByBaseSkuHandler } from '../../src/modules/products/application/queries/get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.handler';
import { GetPosVariantsByBaseSkuQuery } from '../../src/modules/products/application/queries/get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.query';
import { GetProductsHandler } from '../../src/modules/products/application/queries/get-products/get-products.handler';
import { GetProductsQuery } from '../../src/modules/products/application/queries/get-products/get-products.query';
import { GetProductsByNameHandler } from '../../src/modules/products/application/queries/get-products-by-name/get-products-by-name.handler';
import { GetProductsByNameQuery } from '../../src/modules/products/application/queries/get-products-by-name/get-products-by-name.query';
import { GetProductsBySkuAndBarcodeHandler } from '../../src/modules/products/application/queries/get-products-by-sku-and-barcode/get-products-by-sku-and-barcode.handler';
import { GetProductsBySkuAndBarcodeQuery } from '../../src/modules/products/application/queries/get-products-by-sku-and-barcode/get-products-by-sku-and-barcode.query';
import { GetVariantBySkuHandler } from '../../src/modules/products/application/queries/get-variant-by-sku/get-variant-by-sku.handler';
import { GetVariantBySkuQuery } from '../../src/modules/products/application/queries/get-variant-by-sku/get-variant-by-sku.query';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Búsqueda de productos para el POS y el catálogo con los handlers reales sobre Postgres. */
describe('Búsqueda de productos del POS', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let northBranchId: string;
  let deletedProductId: string;

  const simple = (sku: string, name: string, stocks: Array<{ branchId: string; quantity: number }> = [], barcode = '', tenant = shop) =>
    new CreateSimpleProductHandler(db.manager).execute(new CreateSimpleProductCommand(tenant.tenantId, name, `desc de ${name}`, sku, barcode, 4, 10, undefined, undefined, undefined, stocks));
  const posVariants = (branchId = shop.branchId, tenantId = shop.tenantId) => new GetPosVariantsHandler(db.manager).execute(new GetPosVariantsQuery(tenantId, branchId));
  const posBySku = (sku: string, branchId = shop.branchId, tenantId = shop.tenantId) => new GetPosVariantBySkuHandler(db.manager).execute(new GetPosVariantBySkuQuery(tenantId, sku, branchId));
  const byBaseSku = (baseSku: string, branchId = shop.branchId, tenantId = shop.tenantId) =>
    new GetPosVariantsByBaseSkuHandler(db.manager).execute(new GetPosVariantsByBaseSkuQuery(tenantId, baseSku, branchId));
  const byCode = (code: string, tenantId = shop.tenantId, branchId?: string) =>
    new GetProductsBySkuAndBarcodeHandler(db.manager).execute(new GetProductsBySkuAndBarcodeQuery(tenantId, code, 1, 50, undefined, branchId));
  const byName = (name: string, tenantId = shop.tenantId) => new GetProductsByNameHandler(db.manager).execute(new GetProductsByNameQuery(tenantId, name, 1, 50));
  const list = (search?: string, extra: Partial<{ page: number; limit: number; type: string; branchId: string; inStockOnly: boolean }> = {}, tenantId = shop.tenantId) =>
    new GetProductsHandler(db.manager).execute(new GetProductsQuery(tenantId, extra.page ?? 1, extra.limit ?? 50, search, extra.type, extra.branchId, extra.inStockOnly));

  beforeAll(async () => {
    database = await startTestDatabase('pos_search');
    db = database.db;
    shop = await seedTenant(db, 'busqueda');
    other = await seedTenant(db, 'busqueda-ajena');
    northBranchId = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;

    await simple('CAM-ROJA', 'Camisa roja', [{ branchId: shop.branchId, quantity: 7 }, { branchId: northBranchId, quantity: 3 }], '7501');
    await simple('CAM-AZUL', 'Camisa azul', [{ branchId: shop.branchId, quantity: 0 }], '7502');
    await simple('PAN-100', 'Pantalón 100% algodón', [{ branchId: shop.branchId, quantity: 2 }], '7503');
    await simple('JEAN_1', 'Jean clásico', [], '7504');
    deletedProductId = (await simple('VIEJO-1', 'Producto descontinuado', [{ branchId: shop.branchId, quantity: 1 }], '7505')).id;
    await new DeleteProductHandler(db.manager).execute(new DeleteProductCommand(shop.tenantId, deletedProductId)).catch(async () => {
      await db.query(`UPDATE product_stocks SET quantity = 0 WHERE variant_id IN (SELECT id FROM product_variants WHERE sku = 'VIEJO-1')`);
      await new DeleteProductHandler(db.manager).execute(new DeleteProductCommand(shop.tenantId, deletedProductId));
    });
    await simple('CAM-ROJA', 'Camisa de la competencia', [{ branchId: other.branchId, quantity: 99 }], '7501', other);

    const color = await new CreateAttributeHandler(db.manager).execute(new CreateAttributeCommand(shop.tenantId, 'Color'));
    const rojo = await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, color.id, 'Rojo'));
    const verde = await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, color.id, 'Verde'));
    await new CreateVariableProductHandler(db.manager).execute(
      new CreateVariableProductCommand(
        shop.tenantId,
        'Gorra',
        'desc',
        [
          { sku: 'GOR-ROJO', purchasePrice: 2, salePrice: 6, barcode: '8801', attributeValues: [{ attributeValueId: rojo.id }], stocks: [{ branchId: shop.branchId, quantity: 4 }] },
          { sku: 'GOR-VERDE', purchasePrice: 2, salePrice: 6, barcode: '8802', attributeValues: [{ attributeValueId: verde.id }] },
        ],
        undefined,
        undefined,
        'GOR',
      ),
    );
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('catálogo del POS', () => {
    it('trae las variantes de la tienda con el stock de la sucursal pedida, sin las borradas ni las ajenas', async () => {
      const here = await posVariants(shop.branchId);
      const skus = here.map((v) => v.sku);
      expect(skus).toEqual(expect.arrayContaining(['CAM-ROJA', 'CAM-AZUL', 'PAN-100', 'JEAN_1', 'GOR-ROJO', 'GOR-VERDE']));
      expect(skus).not.toContain('VIEJO-1');
      expect(here.filter((v) => v.sku === 'CAM-ROJA')).toHaveLength(1);
      expect(here.find((v) => v.sku === 'CAM-ROJA')).toMatchObject({ stock: 7, productName: 'Camisa roja', salePrice: 10 });
      expect(here.find((v) => v.sku === 'JEAN_1')).toMatchObject({ stock: 0 });

      expect((await posVariants(northBranchId)).find((v) => v.sku === 'CAM-ROJA')?.stock).toBe(3);
    });

    it('nunca muestra el stock ni los productos de otra tienda, ni siquiera pidiendo su sucursal', async () => {
      const foreign = await posVariants(other.branchId);
      expect(foreign.find((v) => v.sku === 'CAM-ROJA')).toMatchObject({ stock: 0, productName: 'Camisa roja' });
      expect((await posVariants(shop.branchId, other.tenantId)).map((v) => v.productName)).toEqual(['Camisa de la competencia']);
    });

    it('incluye los atributos de cada variante', async () => {
      const gorra = (await posVariants()).find((v) => v.sku === 'GOR-ROJO');
      expect(gorra?.attributeValues.map((a) => a.value)).toEqual(['Rojo']);
    });
  });

  describe('escaneo por SKU o código de barras', () => {
    it('encuentra por SKU exacto o por código de barras, con su stock', async () => {
      const [bySku] = await posBySku('CAM-ROJA');
      expect(bySku).toMatchObject({ sku: 'CAM-ROJA', barcode: '7501', stock: 7, productName: 'Camisa roja' });
      const [byBarcode] = await posBySku('7502');
      expect(byBarcode).toMatchObject({ sku: 'CAM-AZUL', stock: 0 });
    });

    it('recorta espacios, no coincide en parte ni con comodines y no se mezcla con otra tienda', async () => {
      expect(await posBySku('  7503 ')).toHaveLength(1);
      expect(await posBySku('CAM')).toEqual([]);
      expect(await posBySku('%')).toEqual([]);
      const foreign = await posBySku('CAM-ROJA', other.branchId, other.tenantId);
      expect(foreign).toHaveLength(1);
      expect(foreign[0]).toMatchObject({ productName: 'Camisa de la competencia', stock: 99 });
    });

    it('un producto borrado ya no se escanea', async () => {
      expect(await posBySku('VIEJO-1')).toEqual([]);
      expect(await posBySku('7505')).toEqual([]);
    });

    it('la variante por SKU para compras ignora mayúsculas y responde VARIANT_NOT_FOUND si no existe', async () => {
      const handler = new GetVariantBySkuHandler(db.manager);
      await expect(handler.execute(new GetVariantBySkuQuery(shop.tenantId, ' cam-roja '))).resolves.toMatchObject({ sku: 'CAM-ROJA', productName: 'Camisa roja' });
      await expect(handler.execute(new GetVariantBySkuQuery(shop.tenantId, 'NO-EXISTE'))).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
      await expect(handler.execute(new GetVariantBySkuQuery(other.tenantId, 'GOR-ROJO'))).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });
  });

  describe('producto con variantes por SKU base', () => {
    it('devuelve el producto con sus variantes, atributos y stock de la sucursal', async () => {
      const gorra = await byBaseSku('GOR');
      expect(gorra).toMatchObject({ productName: 'Gorra', baseSku: 'GOR' });
      expect(gorra?.variants.map((v) => v.sku).sort()).toEqual(['GOR-ROJO', 'GOR-VERDE']);
      expect(gorra?.variants.find((v) => v.sku === 'GOR-ROJO')).toMatchObject({ stock: 4, attributes: [{ name: 'Color', value: 'Rojo' }] });
      expect(gorra?.attributes).toMatchObject([{ name: 'Color' }]);
      expect(gorra?.attributes[0].values.map((v) => v.value).sort()).toEqual(['Rojo', 'Verde']);
    });

    it('no encuentra productos simples, SKUs de otra tienda ni inexistentes', async () => {
      expect(await byBaseSku('CAM-ROJA')).toBeNull();
      expect(await byBaseSku('GOR', other.branchId, other.tenantId)).toBeNull();
      expect(await byBaseSku('NO-EXISTE')).toBeNull();
    });
  });

  describe('búsqueda en el catálogo', () => {
    it('por SKU o código de barras coincide en parte, sin importar mayúsculas', async () => {
      expect((await byCode('cam-')).data.map((p) => p.baseSku).sort()).toEqual(['CAM-AZUL', 'CAM-ROJA']);
      expect((await byCode('7503')).data).toHaveLength(1);
    });

    it('por nombre coincide en parte y solo trae productos de la tienda', async () => {
      expect((await byName('camisa')).data.map((p) => p.name).sort()).toEqual(['Camisa azul', 'Camisa roja']);
      expect((await byName('camisa', other.tenantId)).data.map((p) => p.name)).toEqual(['Camisa de la competencia']);
    });

    it('los comodines del usuario se buscan como texto, no como patrón', async () => {
      // "%" y "_" literales: solo coinciden con "100%" y "JEAN_1", no con todo el catálogo
      expect((await byName('%')).data.map((p) => p.name)).toEqual(['Pantalón 100% algodón']);
      expect((await byCode('%')).data).toEqual([]);
      expect((await byCode('_')).data.map((p) => p.baseSku)).toEqual(['JEAN_1']);
      expect((await list('%')).data.map((p) => p.name)).toEqual(['Pantalón 100% algodón']);
      expect((await byName('a\\')).data).toEqual([]);
    });

    it('el listado filtra por tipo, por stock y pagina con tope', async () => {
      const all = await list();
      expect(all.meta.total).toBe(5);
      expect(all.data.map((p) => p.name)).not.toContain('Producto descontinuado');
      expect((await list(undefined, { type: 'VARIABLE' })).data.map((p) => p.name)).toEqual(['Gorra']);
      const inStock = await list(undefined, { branchId: shop.branchId, inStockOnly: true });
      expect(inStock.data.map((p) => p.name).sort()).toEqual(['Camisa roja', 'Gorra', 'Pantalón 100% algodón']);

      const second = await list(undefined, { page: 2, limit: 2 });
      expect(second.data).toHaveLength(2);
      expect(second.meta).toMatchObject({ total: 5, page: 2, totalPages: 3 });
    });

    it('el stock de una variante en el listado solo trae la sucursal pedida', async () => {
      const result = await byCode('CAM-ROJA', shop.tenantId, northBranchId);
      expect(result.data[0].variants[0].stocks).toEqual([{ branchId: northBranchId, branchName: 'Norte', quantity: 3 }]);
    });
  });
});
