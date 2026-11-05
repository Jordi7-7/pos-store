import { DataSource } from 'typeorm';
import { CreateSimpleProductCommand } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.command';
import { CreateSimpleProductHandler } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.handler';
import { CreateVariableProductCommand } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.command';
import { CreateVariableProductHandler } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.handler';
import { CreateVariantCommand } from '../../src/modules/products/application/commands/create-variant/create-variant.command';
import { CreateVariantHandler } from '../../src/modules/products/application/commands/create-variant/create-variant.handler';
import { ImportProductItemInput, ImportProductsCommand } from '../../src/modules/products/application/commands/import-products/import-products.command';
import { ImportProductsHandler } from '../../src/modules/products/application/commands/import-products/import-products.handler';
import { UpdateSimpleProductCommand } from '../../src/modules/products/application/commands/update-simple-product/update-simple-product.command';
import { UpdateSimpleProductHandler } from '../../src/modules/products/application/commands/update-simple-product/update-simple-product.handler';
import { UpdateVariantCommand } from '../../src/modules/products/application/commands/update-variant/update-variant.command';
import { UpdateVariantHandler } from '../../src/modules/products/application/commands/update-variant/update-variant.handler';
import { GetPosVariantBySkuHandler } from '../../src/modules/products/application/queries/get-pos-variant-by-sku/get-pos-variant-by-sku.handler';
import { GetPosVariantBySkuQuery } from '../../src/modules/products/application/queries/get-pos-variant-by-sku/get-pos-variant-by-sku.query';
import { GetPosVariantsByBaseSkuHandler } from '../../src/modules/products/application/queries/get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.handler';
import { GetPosVariantsByBaseSkuQuery } from '../../src/modules/products/application/queries/get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.query';
import { GetVariantBySkuHandler } from '../../src/modules/products/application/queries/get-variant-by-sku/get-variant-by-sku.handler';
import { GetVariantBySkuQuery } from '../../src/modules/products/application/queries/get-variant-by-sku/get-variant-by-sku.query';
import { ValidateImportProductsHandler } from '../../src/modules/products/application/queries/validate-import-products/validate-import-products.handler';
import { ValidateImportProductsQuery } from '../../src/modules/products/application/queries/validate-import-products/validate-import-products.query';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { ImportPurchasesCommand } from '../../src/modules/purchases/application/commands/import-purchases/import-purchases.command';
import { ImportPurchasesHandler } from '../../src/modules/purchases/application/commands/import-purchases/import-purchases.handler';
import { ValidateImportPurchasesHandler } from '../../src/modules/purchases/application/queries/validate-import-purchases/validate-import-purchases.handler';
import { ValidateImportPurchasesQuery } from '../../src/modules/purchases/application/queries/validate-import-purchases/validate-import-purchases.query';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Regla única del SKU: sin espacios en los extremos y en MAYÚSCULAS, al guardar, buscar e importar. */
describe('SKU: normalización a mayúsculas', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;

  const skuOf = async (productId: string): Promise<string[]> => (await db.getRepository(ProductVariant).findBy({ productId })).map((v) => v.sku).sort();
  const simple = (sku: string, barcode = '') => new CreateSimpleProductHandler(db.manager).execute(new CreateSimpleProductCommand(shop.tenantId, `Producto ${sku}`, 'd', sku, barcode, 4, 10));
  const variable = (baseSku: string, skus: string[]) =>
    new CreateVariableProductHandler(db.manager).execute(
      new CreateVariableProductCommand(shop.tenantId, `Familia ${baseSku}`, 'd', skus.map((sku) => ({ sku, purchasePrice: 2, salePrice: 5 })), undefined, undefined, baseSku),
    );
  const importProducts = (items: ImportProductItemInput[]) => new ImportProductsHandler(db.manager, redisStub).execute(new ImportProductsCommand(shop.tenantId, shop.ownerId, undefined, items));
  const item = (sku: string): ImportProductItemInput => ({ sku, name: `Importado ${sku}`, purchasePrice: 2, salePrice: 5, quantity: 0 });

  beforeAll(async () => {
    database = await startTestDatabase('sku_case');
    db = database.db;
    shop = await seedTenant(db, 'mayusculas');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('al guardar', () => {
    it('un producto simple guarda su SKU y su SKU base recortados y en mayúsculas', async () => {
      const product = await simple('  cam-roja ');
      expect(await skuOf(product.id)).toEqual(['CAM-ROJA']);
      expect((await db.getRepository(Product).findOneByOrFail({ id: product.id })).baseSku).toBe('CAM-ROJA');
    });

    it('"cam-roja", "CAM-ROJA" y " Cam-Roja " son el mismo SKU: el segundo producto se rechaza', async () => {
      await expect(simple('CAM-ROJA')).rejects.toMatchObject({ code: 'SKU_TAKEN' });
      await expect(simple(' Cam-Roja ')).rejects.toMatchObject({ code: 'SKU_TAKEN' });
    });

    it('un producto con variantes guarda todos sus SKUs en mayúsculas', async () => {
      const product = await variable('gor', ['gor-rojo', ' Gor-Verde']);
      expect(await skuOf(product.id)).toEqual(['GOR-ROJO', 'GOR-VERDE']);
      await expect(variable('OTRA', ['gor-rojo'])).rejects.toMatchObject({ code: 'SKU_TAKEN' });
    });

    it('añadir una variante y editar un SKU también normalizan, y el SKU base de un simple lo sigue', async () => {
      const family = await variable('FAM', ['FAM-1']);
      const added = await new CreateVariantHandler(db.manager).execute(new CreateVariantCommand(shop.tenantId, family.id, { sku: 'fam-2', purchasePrice: 1, salePrice: 2 }));
      expect(added.sku).toBe('FAM-2');

      const single = await simple('uno-a');
      await new UpdateSimpleProductHandler(db.manager).execute(new UpdateSimpleProductCommand(shop.tenantId, single.id, undefined, undefined, undefined, undefined, 'uno-b'));
      expect(await skuOf(single.id)).toEqual(['UNO-B']);
      expect((await db.getRepository(Product).findOneByOrFail({ id: single.id })).baseSku).toBe('UNO-B');

      const [variant] = await db.getRepository(ProductVariant).findBy({ productId: family.id, sku: 'FAM-1' });
      await new UpdateVariantHandler(db.manager).execute(new UpdateVariantCommand(shop.tenantId, variant.id, 'fam-uno'));
      expect((await db.getRepository(ProductVariant).findOneByOrFail({ id: variant.id })).sku).toBe('FAM-UNO');
    });
  });

  describe('al buscar y escanear', () => {
    it('el SKU se encuentra tecleado en cualquier capitalización', async () => {
      const bySku = (sku: string) => new GetVariantBySkuHandler(db.manager).execute(new GetVariantBySkuQuery(shop.tenantId, sku));
      await expect(bySku('cam-roja')).resolves.toMatchObject({ sku: 'CAM-ROJA' });
      await expect(bySku(' CAM-ROJA ')).resolves.toMatchObject({ sku: 'CAM-ROJA' });
      await expect(bySku('NO-EXISTE')).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });

    it('el escaneo del POS acepta minúsculas en el SKU, y el código de barras sigue siendo exacto', async () => {
      await simple('barras-1', '7501234567890');
      const scan = (code: string) => new GetPosVariantBySkuHandler(db.manager).execute(new GetPosVariantBySkuQuery(shop.tenantId, code, shop.branchId));
      expect((await scan('cam-roja')).map((v) => v.sku)).toEqual(['CAM-ROJA']);
      expect((await scan('7501234567890')).map((v) => v.sku)).toEqual(['BARRAS-1']);
    });

    it('la familia se encuentra por su SKU base en cualquier capitalización', async () => {
      const family = (baseSku: string) => new GetPosVariantsByBaseSkuHandler(db.manager).execute(new GetPosVariantsByBaseSkuQuery(shop.tenantId, baseSku, shop.branchId));
      expect((await family('gor'))?.variants.map((v) => v.sku).sort()).toEqual(['GOR-ROJO', 'GOR-VERDE']);
      expect((await family(' GOR '))?.baseSku).toBe('GOR');
    });
  });

  describe('al importar', () => {
    it('un archivo en minúsculas crea los productos en mayúsculas', async () => {
      await importProducts([item('imp-a'), item(' imp-b ')]);
      const imported = await db.getRepository(ProductVariant).find({ where: { tenantId: shop.tenantId }, order: { sku: 'ASC' } });
      expect(imported.map((v) => v.sku)).toEqual(expect.arrayContaining(['IMP-A', 'IMP-B']));
      expect(imported.map((v) => v.sku)).not.toContain('imp-a');
    });

    it('"abc" y "ABC" dentro del archivo son un SKU repetido, y contra el catálogo uno ya existente', async () => {
      await expect(importProducts([item('rep-1'), item('REP-1')])).rejects.toMatchObject({ code: 'DUPLICATE_SKU_IN_IMPORT', details: { skus: ['REP-1'] } });
      await expect(importProducts([item('cam-roja')])).rejects.toMatchObject({ code: 'SKU_TAKEN' });
    });

    it('la validación previa de productos marca como existentes y repetidos sin importar mayúsculas', async () => {
      const { errors } = await new ValidateImportProductsHandler(db.manager).execute(
        new ValidateImportProductsQuery(shop.tenantId, [{ sku: 'cam-roja', name: 'a' }, { sku: 'nuevo-1', name: 'b' }, { sku: 'NUEVO-1', name: 'c' }]),
      );
      expect(errors['cam-roja']).toMatch(/ya está registrado/i);
      expect(errors['NUEVO-1']).toMatch(/duplicado/i);
      expect(errors['nuevo-1']).toBeUndefined();
    });

    it('un archivo de compras en minúsculas encuentra las variantes, tanto al validar como al importar', async () => {
      const validation = await new ValidateImportPurchasesHandler(db.manager).execute(
        new ValidateImportPurchasesQuery(shop.tenantId, [{ sku: 'cam-roja', quantity: 2 }, { sku: ' gor-rojo ', quantity: 1 }, { sku: 'no-existe', quantity: 1 }]),
      );
      expect(validation.names).toMatchObject({ 'cam-roja': 'Producto   cam-roja ', ' gor-rojo ': 'Familia gor' });
      expect(Object.keys(validation.errors)).toEqual(['no-existe']);

      await new ImportPurchasesHandler(db.manager, redisStub).execute(
        new ImportPurchasesCommand(shop.tenantId, shop.ownerId, shop.branchId, [{ sku: 'cam-roja', quantity: 3 }, { sku: 'GOR-VERDE', quantity: 2 }], 'F-MIN'),
      );
      const stock = await db.query(`SELECT SUM(s.quantity)::int AS total FROM product_stocks s JOIN product_variants v ON v.id = s.variant_id WHERE v.sku IN ('CAM-ROJA', 'GOR-VERDE')`);
      expect(stock[0].total).toBe(5);
    });
  });

  describe('migración de SKUs existentes', () => {
    it('pasa a mayúsculas los SKUs antiguos y se detiene si dos solo difieren en la capitalización', async () => {
      const applied = async () => (await db.query(`SELECT 1 FROM migrations WHERE name LIKE 'NormalizeVariantSkusToUppercase%'`)).length > 0;
      for (let undone = 0; undone < 10 && (await applied()); undone++) {
        await db.undoLastMigration();
      }

      const old = await simple('LEGADO-1');
      const twinA = await simple('GEMELO-A');
      const twinB = await simple('GEMELO-B');
      await db.query(`UPDATE product_variants SET sku = ' legado-1 ' WHERE product_id = $1`, [old.id]);
      await db.query(`UPDATE product_variants SET sku = 'gemelo-x' WHERE product_id = $1`, [twinA.id]);
      await db.query(`UPDATE product_variants SET sku = 'GEMELO-X' WHERE product_id = $1`, [twinB.id]);

      await expect(db.runMigrations()).rejects.toThrow(/solo difieren en mayúsculas.*GEMELO-X/);
      expect(await applied()).toBe(false);

      await db.query(`UPDATE product_variants SET sku = 'GEMELO-Y' WHERE product_id = $1`, [twinB.id]);
      await db.runMigrations();
      expect(await skuOf(old.id)).toEqual(['LEGADO-1']);
      expect(await skuOf(twinA.id)).toEqual(['GEMELO-X']);
    });
  });
});
