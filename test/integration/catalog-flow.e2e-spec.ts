import { DataSource } from 'typeorm';
import { CreateAttributeCommand } from '../../src/modules/products/application/commands/create-attribute/create-attribute.command';
import { CreateAttributeHandler } from '../../src/modules/products/application/commands/create-attribute/create-attribute.handler';
import { CreateAttributeValueCommand } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.command';
import { CreateAttributeValueHandler } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.handler';
import { CreateCategoryCommand } from '../../src/modules/products/application/commands/create-category/create-category.command';
import { CreateCategoryHandler } from '../../src/modules/products/application/commands/create-category/create-category.handler';
import { CreateSimpleProductCommand } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.command';
import { CreateSimpleProductHandler } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.handler';
import { CreateVariableProductCommand } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.command';
import { CreateVariableProductHandler } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.handler';
import { CreateVariantCommand, VariantInput } from '../../src/modules/products/application/commands/create-variant/create-variant.command';
import { CreateVariantHandler } from '../../src/modules/products/application/commands/create-variant/create-variant.handler';
import { DeleteProductCommand } from '../../src/modules/products/application/commands/delete-product/delete-product.command';
import { DeleteProductHandler } from '../../src/modules/products/application/commands/delete-product/delete-product.handler';
import { DeleteVariantCommand } from '../../src/modules/products/application/commands/delete-variant/delete-variant.command';
import { DeleteVariantHandler } from '../../src/modules/products/application/commands/delete-variant/delete-variant.handler';
import { ImportProductItemInput, ImportProductsCommand } from '../../src/modules/products/application/commands/import-products/import-products.command';
import { ImportProductsHandler } from '../../src/modules/products/application/commands/import-products/import-products.handler';
import { UpdateSimpleProductCommand } from '../../src/modules/products/application/commands/update-simple-product/update-simple-product.command';
import { UpdateSimpleProductHandler } from '../../src/modules/products/application/commands/update-simple-product/update-simple-product.handler';
import { UpdateVariantCommand } from '../../src/modules/products/application/commands/update-variant/update-variant.command';
import { UpdateVariantHandler } from '../../src/modules/products/application/commands/update-variant/update-variant.handler';
import { ValidateImportProductsHandler } from '../../src/modules/products/application/queries/validate-import-products/validate-import-products.handler';
import { ValidateImportProductsQuery } from '../../src/modules/products/application/queries/validate-import-products/validate-import-products.query';
import { InventoryMovement } from '../../src/modules/products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../src/modules/products/domain/entities/product-batch.entity';
import { ProductStock } from '../../src/modules/products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * Catálogo con los handlers reales sobre Postgres: crear, editar, eliminar e importar productos
 * y variantes, con su stock inicial, SKUs únicos y aislamiento entre tiendas.
 */
describe('Catálogo: productos, variantes e importación', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const createSimple = (sku: string, overrides: Partial<{ tenantId: string; stocks: Array<{ branchId: string; quantity: number }>; categoryId: string; price: number }> = {}) =>
    new CreateSimpleProductHandler(db.manager).execute(
      new CreateSimpleProductCommand(
        overrides.tenantId ?? shop.tenantId,
        `Producto ${sku}`,
        'descripción',
        sku,
        '',
        overrides.price ?? 4,
        10,
        undefined,
        overrides.categoryId,
        undefined,
        overrides.stocks,
      ),
    );
  const createVariable = (name: string, variants: VariantInput[], baseSku = `BASE-${name}`) =>
    new CreateVariableProductHandler(db.manager).execute(new CreateVariableProductCommand(shop.tenantId, name, 'desc', variants, undefined, undefined, baseSku));
  const deleteProduct = (id: string, tenantId = shop.tenantId) => new DeleteProductHandler(db.manager).execute(new DeleteProductCommand(tenantId, id));
  const importProducts = (items: ImportProductItemInput[], branchId: string | null = shop.branchId) =>
    new ImportProductsHandler(db.manager, redisStub).execute(new ImportProductsCommand(shop.tenantId, shop.ownerId, branchId ?? undefined, items));
  const item = (sku: string, quantity = 5): ImportProductItemInput => ({ sku, name: `Importado ${sku}`, purchasePrice: 2, salePrice: 5, quantity });

  const variantBySku = (sku: string, tenantId = shop.tenantId) => db.getRepository(ProductVariant).findOneBy({ sku, tenantId });
  const stockOf = async (sku: string): Promise<number> => {
    const variant = await variantBySku(sku);
    const stock = variant ? await db.getRepository(ProductStock).findOneBy({ variantId: variant.id, branchId: shop.branchId }) : null;
    return stock ? Number(stock.quantity) : 0;
  };
  const countProducts = (): Promise<number> => db.getRepository(Product).countBy({ tenantId: shop.tenantId });

  const newAttribute = async (name: string, values: string[]): Promise<{ attributeId: string; valueIds: string[] }> => {
    const attribute = await new CreateAttributeHandler(db.manager).execute(new CreateAttributeCommand(shop.tenantId, name));
    const valueIds: string[] = [];
    for (const value of values) {
      valueIds.push((await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, attribute.id, value))).id);
    }
    return { attributeId: attribute.id, valueIds };
  };

  beforeAll(async () => {
    database = await startTestDatabase('catalog');
    db = database.db;
    shop = await seedTenant(db, 'catalogo');
    other = await seedTenant(db, 'ajeno');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('crear producto simple', () => {
    it('crea producto y variante con su stock inicial, lote y movimiento de kardex', async () => {
      const product = await createSimple('SIM-1', { stocks: [{ branchId: shop.branchId, quantity: 12 }], price: 3.5 });

      expect(product).toMatchObject({ type: 'SIMPLE', baseSku: 'SIM-1' });
      expect(await stockOf('SIM-1')).toBe(12);

      const variant = await variantBySku('SIM-1');
      const batches = await db.getRepository(ProductBatch).find({ where: { variantId: variant?.id } });
      expect(batches).toHaveLength(1);
      expect(Number(batches[0].remainingQuantity)).toBe(12);
      expect(Number(batches[0].unitCost)).toBe(3.5);
      const movements = await db.getRepository(InventoryMovement).find({ where: { variantId: variant?.id } });
      expect(movements).toMatchObject([{ type: 'IN', reason: 'INITIAL_STOCK' }]);
    });

    it('sin stock inicial no crea lotes ni movimientos', async () => {
      await createSimple('SIM-2');
      const variant = await variantBySku('SIM-2');

      expect(await db.getRepository(ProductBatch).countBy({ variantId: variant?.id })).toBe(0);
      expect(await db.getRepository(InventoryMovement).countBy({ variantId: variant?.id })).toBe(0);
    });

    it('el SKU es único por tienda: se rechaza repetido, pero otra tienda puede usarlo', async () => {
      await createSimple('SIM-3');
      const before = await countProducts();

      await expect(createSimple('SIM-3')).rejects.toMatchObject({ code: 'SKU_TAKEN', details: { sku: 'SIM-3' } });
      expect(await countProducts()).toBe(before);

      await expect(createSimple('SIM-3', { tenantId: other.tenantId })).resolves.toBeDefined();
    });

    it('una sucursal o categoría de otra tienda se rechaza y no deja nada creado', async () => {
      const before = await countProducts();

      await expect(createSimple('SIM-4', { stocks: [{ branchId: other.branchId, quantity: 1 }] })).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
      await expect(createSimple('SIM-5', { categoryId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });

      expect(await countProducts()).toBe(before);
      expect(await variantBySku('SIM-4')).toBeNull();
    });

    it('creaciones simultáneas con el mismo SKU: una gana y el resto recibe SKU_TAKEN, nunca un error de la base de datos', async () => {
      // Varias rondas: la carrera depende del tiempo y una sola puede no coincidir
      for (let round = 0; round < 6; round++) {
        const sku = `RACE-${round}`;
        const results = await Promise.allSettled([createSimple(sku), createSimple(sku), createSimple(sku), createSimple(sku)]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const codes = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map((failure) => (failure.reason as { code?: string }).code);
        expect(codes).toEqual(['SKU_TAKEN', 'SKU_TAKEN', 'SKU_TAKEN']);
        expect(await db.getRepository(ProductVariant).countBy({ tenantId: shop.tenantId, sku })).toBe(1);
      }
    });

    it('una misma sucursal repetida en el stock inicial responde con un error de negocio, no con un 500', async () => {
      await expect(
        createSimple('DUP-BR', { stocks: [{ branchId: shop.branchId, quantity: 1 }, { branchId: shop.branchId, quantity: 2 }] }),
      ).rejects.toMatchObject({ code: expect.any(String) as string });
      expect(await variantBySku('DUP-BR')).toBeNull();
    });
  });

  describe('crear producto con variantes', () => {
    it('crea el producto con sus variantes, atributos y stock por sucursal', async () => {
      const color = await newAttribute('Color', ['Rojo', 'Azul']);
      const product = await createVariable('Camiseta', [
        { sku: 'CAM-R', purchasePrice: 3, salePrice: 8, attributeValues: [{ attributeValueId: color.valueIds[0] }], stocks: [{ branchId: shop.branchId, quantity: 4 }] },
        { sku: 'CAM-A', purchasePrice: 3, salePrice: 8, attributeValues: [{ attributeValueId: color.valueIds[1] }] },
      ]);

      expect(product).toMatchObject({ type: 'VARIABLE', baseSku: 'BASE-CAMISETA' });
      expect(await db.getRepository(ProductVariant).countBy({ productId: product.id })).toBe(2);
      expect(await stockOf('CAM-R')).toBe(4);
      expect(await stockOf('CAM-A')).toBe(0);
    });

    it('rechaza dos variantes con la misma combinación de atributos y no crea nada', async () => {
      const size = await newAttribute('Talla', ['S', 'M']);
      const before = await countProducts();

      await expect(
        createVariable('Pantalón', [
          { sku: 'PAN-1', purchasePrice: 1, salePrice: 2, attributeValues: [{ attributeValueId: size.valueIds[0] }] },
          { sku: 'PAN-2', purchasePrice: 1, salePrice: 2, attributeValues: [{ attributeValueId: size.valueIds[0] }] },
        ]),
      ).rejects.toMatchObject({ code: 'DUPLICATE_VARIANT_COMBINATION' });

      expect(await countProducts()).toBe(before);
    });

    it('rechaza un SKU que ya existe y exige al menos una variante y un SKU base', async () => {
      await createSimple('VAR-TAKEN');

      await expect(createVariable('Taken', [{ sku: 'VAR-TAKEN', purchasePrice: 1, salePrice: 2 }])).rejects.toMatchObject({ code: 'SKU_TAKEN' });
      await expect(createVariable('Vacío', [])).rejects.toMatchObject({ code: 'VARIANTS_REQUIRED' });
      await expect(createVariable('SinBase', [{ sku: 'SB-1', purchasePrice: 1, salePrice: 2 }], '')).rejects.toMatchObject({ code: 'BASE_SKU_REQUIRED' });
    });

    it('añadir una variante a un producto existente respeta SKU y combinaciones', async () => {
      const size = await newAttribute('Número', ['38', '40', '42']);
      const product = await createVariable('Zapato', [{ sku: 'ZAP-38', purchasePrice: 5, salePrice: 12, attributeValues: [{ attributeValueId: size.valueIds[0] }] }]);
      const add = (variant: VariantInput) => new CreateVariantHandler(db.manager).execute(new CreateVariantCommand(shop.tenantId, product.id, variant));

      await expect(add({ sku: 'ZAP-40', purchasePrice: 5, salePrice: 12, attributeValues: [{ attributeValueId: size.valueIds[1] }] })).resolves.toBeDefined();
      await expect(add({ sku: 'ZAP-X', purchasePrice: 5, salePrice: 12, attributeValues: [{ attributeValueId: size.valueIds[0] }] })).rejects.toMatchObject({ code: 'DUPLICATE_VARIANT_COMBINATION' });
      await expect(add({ sku: 'ZAP-40', purchasePrice: 5, salePrice: 12 })).rejects.toMatchObject({ code: 'SKU_TAKEN' });
    });
  });

  describe('editar', () => {
    const updateSimple = (id: string, changes: Partial<{ sku: string; salePrice: number; name: string }>, tenantId = shop.tenantId) =>
      new UpdateSimpleProductHandler(db.manager).execute(
        new UpdateSimpleProductCommand(tenantId, id, changes.name, undefined, undefined, undefined, changes.sku, undefined, undefined, changes.salePrice),
      );

    it('cambia precio y nombre, y conservar el propio SKU no cuenta como repetido', async () => {
      const product = await createSimple('EDT-1');

      await updateSimple(product.id, { sku: 'EDT-1', salePrice: 15.5, name: 'Nuevo nombre' });

      const variant = await variantBySku('EDT-1');
      expect(Number(variant?.salePrice)).toBe(15.5);
      expect((await db.getRepository(Product).findOneByOrFail({ id: product.id })).name).toBe('Nuevo nombre');
    });

    it('no permite quedarse con el SKU de otro producto', async () => {
      await createSimple('EDT-2');
      const product = await createSimple('EDT-3');

      await expect(updateSimple(product.id, { sku: 'EDT-2' })).rejects.toMatchObject({ code: 'SKU_TAKEN' });
      expect(await variantBySku('EDT-3')).not.toBeNull();
    });

    it('un producto de otra tienda no se puede editar', async () => {
      const product = await createSimple('EDT-4');
      await expect(updateSimple(product.id, { salePrice: 1 }, other.tenantId)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('un producto con variantes no se edita como simple', async () => {
      const product = await createVariable('Gorra', [{ sku: 'GOR-1', purchasePrice: 1, salePrice: 2 }, { sku: 'GOR-2', purchasePrice: 1, salePrice: 2 }]);
      await expect(updateSimple(product.id, { salePrice: 1 })).rejects.toMatchObject({ code: 'PRODUCT_NOT_SIMPLE' });
    });

    it('editar una variante respeta la unicidad del SKU', async () => {
      await createSimple('VAR-E1');
      const product = await createVariable('Bufanda', [{ sku: 'BUF-1', purchasePrice: 1, salePrice: 2 }, { sku: 'BUF-2', purchasePrice: 1, salePrice: 2 }]);
      const variant = await variantBySku('BUF-2');
      const update = (sku: string) => new UpdateVariantHandler(db.manager).execute(new UpdateVariantCommand(shop.tenantId, variant?.id ?? '', sku));

      await expect(update('VAR-E1')).rejects.toMatchObject({ code: 'SKU_TAKEN' });
      await expect(update('BUF-2B')).resolves.toBeDefined();
      expect(product.id).toBeDefined();
    });
  });

  describe('eliminar', () => {
    it('un producto con existencias no se elimina; sin ellas sí, y su SKU queda libre', async () => {
      const product = await createSimple('DEL-1', { stocks: [{ branchId: shop.branchId, quantity: 3 }] });

      await expect(deleteProduct(product.id)).rejects.toMatchObject({ code: 'PRODUCT_HAS_STOCK' });

      await db.getRepository(ProductStock).update({ branchId: shop.branchId, variantId: (await variantBySku('DEL-1'))?.id }, { quantity: 0 });
      await deleteProduct(product.id);

      expect(await variantBySku('DEL-1')).toBeNull();
      await expect(createSimple('DEL-1')).resolves.toBeDefined();
    });

    it('un saldo negativo también impide eliminar', async () => {
      const product = await createSimple('DEL-2');
      await db.getRepository(ProductStock).save(db.getRepository(ProductStock).create({ branchId: shop.branchId, variantId: (await variantBySku('DEL-2'))?.id, quantity: -2 }));

      await expect(deleteProduct(product.id)).rejects.toMatchObject({ code: 'PRODUCT_HAS_STOCK' });
    });

    it('un producto de otra tienda no se puede eliminar', async () => {
      const product = await createSimple('DEL-3');
      await expect(deleteProduct(product.id, other.tenantId)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      expect(await variantBySku('DEL-3')).not.toBeNull();
    });

    it('no se elimina la única variante, ni una con existencias; una libre sí', async () => {
      const single = await createSimple('DV-ONLY');
      const removeVariant = (sku: string) =>
        variantBySku(sku).then((variant) => new DeleteVariantHandler(db.manager).execute(new DeleteVariantCommand(shop.tenantId, variant?.id ?? '')));

      await expect(removeVariant('DV-ONLY')).rejects.toMatchObject({ code: 'LAST_VARIANT_CANNOT_BE_DELETED' });

      await createVariable('Medias', [
        { sku: 'MED-1', purchasePrice: 1, salePrice: 2, stocks: [{ branchId: shop.branchId, quantity: 2 }] },
        { sku: 'MED-2', purchasePrice: 1, salePrice: 2 },
      ]);
      await expect(removeVariant('MED-1')).rejects.toMatchObject({ code: 'VARIANT_HAS_STOCK' });
      await expect(removeVariant('MED-2')).resolves.toBeUndefined();
      expect(await variantBySku('MED-2')).toBeNull();
      expect(single.id).toBeDefined();
    });
  });

  describe('importar productos', () => {
    it('crea productos y variantes con stock, lote y kardex en la sucursal indicada', async () => {
      const result = await importProducts([item('IMPP-1', 5), item('IMPP-2', 0), item('IMPP-3', -2)]);

      expect(result.importedCount).toBe(3);
      expect(await stockOf('IMPP-1')).toBe(5);
      expect(await stockOf('IMPP-2')).toBe(0);
      expect(await stockOf('IMPP-3')).toBe(-2);
      expect(await db.getRepository(ProductBatch).countBy({ variantId: (await variantBySku('IMPP-1'))?.id })).toBe(1);
      expect(await db.getRepository(ProductBatch).countBy({ variantId: (await variantBySku('IMPP-3'))?.id })).toBe(0);
    });

    it('sin sucursal importa solo el catálogo, sin stock', async () => {
      await importProducts([item('IMPP-NB', 9)], null);

      expect(await variantBySku('IMPP-NB')).not.toBeNull();
      expect(await db.getRepository(ProductStock).countBy({ variantId: (await variantBySku('IMPP-NB'))?.id })).toBe(0);
    });

    it('si algún SKU ya existe se rechaza todo el archivo indicando cuáles, sin importar nada', async () => {
      await createSimple('IMPP-EXISTE');
      const before = await countProducts();

      await expect(importProducts([item('IMPP-NUEVO'), item('IMPP-EXISTE')])).rejects.toMatchObject({ code: 'SKU_TAKEN', details: { skus: ['IMPP-EXISTE'] } });

      expect(await countProducts()).toBe(before);
      expect(await variantBySku('IMPP-NUEVO')).toBeNull();
    });

    it('un SKU repetido dentro del mismo archivo se rechaza indicando cuál, y no importa nada', async () => {
      const before = await countProducts();

      await expect(importProducts([item('IMPP-REP'), item('IMPP-REP')])).rejects.toMatchObject({ code: 'DUPLICATE_SKU_IN_IMPORT', details: { skus: ['IMPP-REP'] } });

      expect(await countProducts()).toBe(before);
    });

    it('rechaza una importación vacía o de más de 3000 filas', async () => {
      await expect(importProducts([])).rejects.toMatchObject({ code: 'IMPORT_EMPTY' });
      await expect(importProducts(Array.from({ length: 3001 }, (_, i) => item(`BIG-${i}`)))).rejects.toMatchObject({ code: 'IMPORT_LIMIT_EXCEEDED' });
    });

    it('una sucursal de otra tienda se rechaza', async () => {
      await expect(importProducts([item('IMPP-X')], other.branchId)).rejects.toMatchObject({ code: expect.stringMatching(/BRANCH/) as string });
      expect(await variantBySku('IMPP-X')).toBeNull();
    });

    it('la validación previa marca los SKUs que ya existen sin escribir nada', async () => {
      await createSimple('VAL-1');
      const before = await countProducts();

      const { errors } = await new ValidateImportProductsHandler(db.manager).execute(
        new ValidateImportProductsQuery(shop.tenantId, [{ sku: 'VAL-1', name: 'Existente' }, { sku: 'VAL-NUEVO', name: 'Nuevo' }]),
      );

      expect(Object.keys(errors).length).toBeGreaterThan(0);
      expect(JSON.stringify(errors)).toContain('VAL-1');
      expect(JSON.stringify(errors)).not.toContain('VAL-NUEVO');
      expect(await countProducts()).toBe(before);
    });
  });

  describe('categorías y atributos', () => {
    it('los nombres son únicos por tienda y cada tienda tiene los suyos', async () => {
      const create = (name: string, tenantId = shop.tenantId) => new CreateCategoryHandler(db.manager).execute(new CreateCategoryCommand(tenantId, name));

      await create('Bebidas');
      await expect(create('Bebidas')).rejects.toMatchObject({ code: 'CATEGORY_NAME_TAKEN' });
      await expect(create('Bebidas', other.tenantId)).resolves.toBeDefined();
    });

    it('un valor de atributo es único dentro de su atributo y el atributo debe ser de la tienda', async () => {
      const material = await newAttribute('Material', ['Algodón']);
      const addValue = (attributeId: string, value: string, tenantId = shop.tenantId) =>
        new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(tenantId, attributeId, value));

      await expect(addValue(material.attributeId, 'Algodón')).rejects.toMatchObject({ code: 'ATTRIBUTE_VALUE_TAKEN' });
      await expect(addValue(material.attributeId, 'Lana', other.tenantId)).rejects.toMatchObject({ code: 'ATTRIBUTE_NOT_FOUND' });
    });
  });
});
