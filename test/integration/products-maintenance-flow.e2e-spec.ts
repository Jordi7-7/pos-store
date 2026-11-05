import { DataSource } from 'typeorm';
import { CreateAttributeCommand } from '../../src/modules/products/application/commands/create-attribute/create-attribute.command';
import { CreateAttributeHandler } from '../../src/modules/products/application/commands/create-attribute/create-attribute.handler';
import { CreateAttributeValueCommand } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.command';
import { CreateAttributeValueHandler } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.handler';
import { CreateCategoryCommand } from '../../src/modules/products/application/commands/create-category/create-category.command';
import { CreateCategoryHandler } from '../../src/modules/products/application/commands/create-category/create-category.handler';
import { CreateVariantCommand } from '../../src/modules/products/application/commands/create-variant/create-variant.command';
import { CreateVariantHandler } from '../../src/modules/products/application/commands/create-variant/create-variant.handler';
import { CreateSimpleProductCommand } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.command';
import { CreateSimpleProductHandler } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.handler';
import { CreateTagCommand } from '../../src/modules/products/application/commands/create-tag/create-tag.command';
import { CreateTagHandler } from '../../src/modules/products/application/commands/create-tag/create-tag.handler';
import { CreateVariableProductCommand } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.command';
import { CreateVariableProductHandler } from '../../src/modules/products/application/commands/create-variable-product/create-variable-product.handler';
import { DeleteProductCommand } from '../../src/modules/products/application/commands/delete-product/delete-product.command';
import { DeleteProductHandler } from '../../src/modules/products/application/commands/delete-product/delete-product.handler';
import { UpdateSimpleProductCommand } from '../../src/modules/products/application/commands/update-simple-product/update-simple-product.command';
import { UpdateSimpleProductHandler } from '../../src/modules/products/application/commands/update-simple-product/update-simple-product.handler';
import { UpdateVariantCommand } from '../../src/modules/products/application/commands/update-variant/update-variant.command';
import { UpdateVariantHandler } from '../../src/modules/products/application/commands/update-variant/update-variant.handler';
import { UpdateProductCommand } from '../../src/modules/products/application/commands/update-product/update-product.command';
import { UpdateProductHandler } from '../../src/modules/products/application/commands/update-product/update-product.handler';
import { UpdateVariantTagsCommand } from '../../src/modules/products/application/commands/update-variant-tags/update-variant-tags.command';
import { UpdateVariantTagsHandler } from '../../src/modules/products/application/commands/update-variant-tags/update-variant-tags.handler';
import { GetAttributesHandler } from '../../src/modules/products/application/queries/get-attributes/get-attributes.handler';
import { GetAttributesQuery } from '../../src/modules/products/application/queries/get-attributes/get-attributes.query';
import { GetCategoriesHandler } from '../../src/modules/products/application/queries/get-categories/get-categories.handler';
import { GetCategoriesQuery } from '../../src/modules/products/application/queries/get-categories/get-categories.query';
import { GetProductByIdHandler } from '../../src/modules/products/application/queries/get-product-by-id/get-product-by-id.handler';
import { GetProductByIdQuery } from '../../src/modules/products/application/queries/get-product-by-id/get-product-by-id.query';
import { GetTagsHandler } from '../../src/modules/products/application/queries/get-tags/get-tags.handler';
import { GetTagsQuery } from '../../src/modules/products/application/queries/get-tags/get-tags.query';
import { ProductImage } from '../../src/modules/products/domain/entities/product-image.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { Tag } from '../../src/modules/products/domain/entities/tag.entity';
import { seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Mantenimiento del catálogo con los handlers reales sobre Postgres: editar producto, consultarlo y sus listas. */
describe('Catálogo: editar producto, consulta por id, categorías, atributos y etiquetas', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const simple = (sku: string, name = `Producto ${sku}`, tenant = shop) =>
    new CreateSimpleProductHandler(db.manager).execute(new CreateSimpleProductCommand(tenant.tenantId, name, 'desc', sku, '', 4, 10));
  const variable = (name: string, baseSku: string, skus: string[], tenant = shop) =>
    new CreateVariableProductHandler(db.manager).execute(
      new CreateVariableProductCommand(tenant.tenantId, name, 'desc', skus.map((sku) => ({ sku, purchasePrice: 2, salePrice: 5 })), undefined, undefined, baseSku),
    );
  const update = (id: string, changes: Partial<{ name: string; description: string; imageIds: string[]; categoryId: string | null; baseSku: string | null }>, tenant = shop) =>
    new UpdateProductHandler(db.manager).execute(new UpdateProductCommand(tenant.tenantId, id, changes.name, changes.description, changes.imageIds, changes.categoryId, changes.baseSku));
  const byId = (id: string, tenantId = shop.tenantId) => new GetProductByIdHandler(db.manager).execute(new GetProductByIdQuery(tenantId, id));
  const category = (name: string, tenant = shop) => new CreateCategoryHandler(db.manager).execute(new CreateCategoryCommand(tenant.tenantId, name));
  const image = (tenant: SeededTenant, url: string) => db.getRepository(ProductImage).save(db.getRepository(ProductImage).create({ tenantId: tenant.tenantId, url }));
  const baseSkuOf = async (productId: string) => (await db.getRepository(Product).findOneByOrFail({ id: productId })).baseSku;
  const skusOf = async (productId: string): Promise<string[]> =>
    (await db.getRepository(ProductVariant).findBy({ productId })).map((v) => v.sku).sort();

  beforeAll(async () => {
    database = await startTestDatabase('products_maint');
    db = database.db;
    shop = await seedTenant(db, 'mantenimiento');
    other = await seedTenant(db, 'mant-ajena');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('consultar un producto por id', () => {
    it('trae categoría, imágenes y variantes con su stock; también se encuentra por el id de una variante', async () => {
      const product = await variable('Gorra', 'GOR', ['GOR-1', 'GOR-2']);
      const found = await byId(product.id);
      expect(found).toMatchObject({ id: product.id, name: 'Gorra', baseSku: 'GOR' });
      expect(found.variants.map((v) => v.sku).sort()).toEqual(['GOR-1', 'GOR-2']);

      const [firstVariant] = await db.getRepository(ProductVariant).findBy({ productId: product.id });
      expect((await byId(firstVariant.id)).id).toBe(product.id);
    });

    it('un id inexistente responde PRODUCT_NOT_FOUND', async () => {
      await expect(byId('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('nunca devuelve el producto de otra tienda, ni por su id ni por el id de una de sus variantes', async () => {
      const foreign = await variable('Ajeno', 'AJ', ['AJ-1'], other);
      const [foreignVariant] = await db.getRepository(ProductVariant).findBy({ productId: foreign.id });

      await expect(byId(foreign.id)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      await expect(byId(foreignVariant.id)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      await expect(byId(foreignVariant.id, other.tenantId)).resolves.toMatchObject({ id: foreign.id });
    });
  });

  describe('editar un producto', () => {
    it('cambia nombre y descripción y deja lo demás como estaba', async () => {
      const product = await simple('UPD-1', 'Original');
      const updated = await update(product.id, { name: 'Nuevo nombre', description: 'Nueva descripción' });
      expect(updated).toMatchObject({ name: 'Nuevo nombre', description: 'Nueva descripción' });
      expect(await skusOf(product.id)).toEqual(['UPD-1']);
    });

    it('asigna, cambia y quita la categoría; una categoría de otra tienda se rechaza', async () => {
      const product = await simple('UPD-2');
      const ropa = await category('Ropa');
      expect((await update(product.id, { categoryId: ropa.id })).categoryId).toBe(ropa.id);
      expect((await update(product.id, { categoryId: null })).categoryId).toBeNull();

      const foreign = await category('Ajena', other);
      await expect(update(product.id, { categoryId: foreign.id })).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    });

    it('al cambiar el SKU base se renombran los SKUs de sus variantes', async () => {
      const product = await variable('Camisa', 'CAM', ['CAM-ROJA', 'CAM-AZUL']);
      await update(product.id, { baseSku: ' cmx ' });

      expect((await byId(product.id)).baseSku).toBe('CMX');
      expect(await skusOf(product.id)).toEqual(['CMX-AZUL', 'CMX-ROJA']);
    });

    it('si falla algo, no queda a medias: una categoría inválida no deja los SKUs renombrados', async () => {
      const product = await variable('Pantalón', 'PAN', ['PAN-1', 'PAN-2']);
      const foreign = await category('Otra tienda', other);

      await expect(update(product.id, { baseSku: 'PNT', categoryId: foreign.id })).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
      expect(await skusOf(product.id)).toEqual(['PAN-1', 'PAN-2']);
      expect((await byId(product.id)).baseSku).toBe('PAN');
    });

    it('un SKU base que ya usa otro producto responde BASE_SKU_TAKEN y no cambia nada', async () => {
      await variable('Zapato', 'ZAP', ['ZAP-1']);
      const product = await variable('Sandalia', 'SAN', ['SAN-1']);

      await expect(update(product.id, { baseSku: 'ZAP' })).rejects.toMatchObject({ code: 'BASE_SKU_TAKEN' });
      expect(await skusOf(product.id)).toEqual(['SAN-1']);
      expect((await byId(product.id)).baseSku).toBe('SAN');
    });

    it('reemplaza las imágenes; las de otra tienda se rechazan y las actuales no se pierden', async () => {
      const product = await simple('UPD-3');
      const mine = await image(shop, 'https://cdn/a.png');
      const foreign = await image(other, 'https://cdn/b.png');

      expect((await update(product.id, { imageIds: [mine.id] })).images.map((i) => i.id)).toEqual([mine.id]);
      await expect(update(product.id, { imageIds: [mine.id, foreign.id] })).rejects.toMatchObject({ code: 'IMAGES_NOT_FOUND' });
      expect((await byId(product.id)).images.map((i) => i.id)).toEqual([mine.id]);
      expect((await update(product.id, { imageIds: [] })).images).toEqual([]);
    });

    it('un producto de otra tienda o inexistente no se puede editar', async () => {
      const product = await simple('UPD-4');
      await expect(update(product.id, { name: 'Robado' }, other)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      expect((await db.getRepository(Product).findOneByOrFail({ id: product.id })).name).toBe(product.name);
    });
  });

  describe('categorías, atributos y etiquetas', () => {
    it('las listas solo traen lo de la tienda, ordenadas por nombre; los atributos con sus valores', async () => {
      await category('Zapatos');
      await category('Accesorios');
      expect((await new GetCategoriesHandler(db.manager).execute(new GetCategoriesQuery(shop.tenantId))).map((c) => c.name)).toEqual(['Accesorios', 'Ropa', 'Zapatos']);
      expect((await new GetCategoriesHandler(db.manager).execute(new GetCategoriesQuery(other.tenantId))).map((c) => c.name)).toEqual(['Ajena', 'Otra tienda']);

      const color = await new CreateAttributeHandler(db.manager).execute(new CreateAttributeCommand(shop.tenantId, 'Color'));
      await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, color.id, 'Rojo'));
      const attributes = await new GetAttributesHandler(db.manager).execute(new GetAttributesQuery(shop.tenantId));
      expect(attributes).toMatchObject([{ name: 'Color', values: [{ value: 'Rojo' }] }]);
      expect(await new GetAttributesHandler(db.manager).execute(new GetAttributesQuery(other.tenantId))).toEqual([]);
    });

    it('crear una etiqueta existente (sin importar mayúsculas) devuelve la misma', async () => {
      const first = await new CreateTagHandler(db.manager).execute(new CreateTagCommand(shop.tenantId, '  Oferta '));
      const again = await new CreateTagHandler(db.manager).execute(new CreateTagCommand(shop.tenantId, 'oferta'));
      expect(first.name).toBe('Oferta');
      expect(again.id).toBe(first.id);
      expect((await new CreateTagHandler(db.manager).execute(new CreateTagCommand(other.tenantId, 'Oferta'))).id).not.toBe(first.id);
    });

    it('creaciones simultáneas de la misma etiqueta dejan una sola', async () => {
      // Varias rondas con nombres distintos: una carrera es cuestión de milisegundos y una ronda sola podría no coincidir
      const names = Array.from({ length: 12 }, (_, i) => `Liquidación ${i}`);
      await Promise.all(names.flatMap((name) => [1, 2, 3, 4].map(() => new CreateTagHandler(db.manager).execute(new CreateTagCommand(shop.tenantId, name)))));

      for (const name of names) {
        expect(await db.getRepository(Tag).countBy({ tenantId: shop.tenantId, name })).toBe(1);
      }
    });

    it('las etiquetas de una variante se reemplazan; las de otra tienda se ignoran y una variante ajena no existe', async () => {
      const product = await simple('TAG-1');
      const [variant] = await db.getRepository(ProductVariant).findBy({ productId: product.id });
      const oferta = await new CreateTagHandler(db.manager).execute(new CreateTagCommand(shop.tenantId, 'Oferta'));
      const nueva = await new CreateTagHandler(db.manager).execute(new CreateTagCommand(shop.tenantId, 'Nueva'));
      const foreignTag = await new CreateTagHandler(db.manager).execute(new CreateTagCommand(other.tenantId, 'Ajena'));
      const set = (tagIds: string[], tenantId = shop.tenantId) => new UpdateVariantTagsHandler(db.manager).execute(new UpdateVariantTagsCommand(tenantId, variant.id, tagIds));

      expect((await set([oferta.id, nueva.id])).tags.map((t) => t.name).sort()).toEqual(['Nueva', 'Oferta']);
      expect((await set([nueva.id, foreignTag.id])).tags.map((t) => t.name)).toEqual(['Nueva']);
      expect((await set([])).tags).toEqual([]);
      await expect(set([oferta.id], other.tenantId)).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });

      expect((await new GetTagsHandler(db.manager).execute(new GetTagsQuery(shop.tenantId))).map((t) => t.name)).toEqual(expect.arrayContaining(['Nueva', 'Oferta']));
    });
  });

  describe('SKU base único por tienda', () => {
    const editSku = (productId: string, sku: string) => new UpdateSimpleProductHandler(db.manager).execute(new UpdateSimpleProductCommand(shop.tenantId, productId, undefined, undefined, undefined, undefined, sku));

    it('dos productos con variantes no pueden compartir el SKU base, sin distinguir mayúsculas', async () => {
      await variable('Bufanda', 'BUF', ['BUF-1']);
      await expect(variable('Bufanda 2', 'buf', ['BUF2-1'])).rejects.toMatchObject({ code: 'BASE_SKU_TAKEN', details: { baseSku: 'BUF' } });
      expect(await db.getRepository(Product).countBy({ tenantId: shop.tenantId, name: 'Bufanda 2' })).toBe(0);
    });

    it('el SKU de un producto simple ocupa el mismo espacio que el SKU base de los demás', async () => {
      await simple('MIX-1');
      await expect(variable('Mezcla', 'MIX-1', ['MIXV-1'])).rejects.toMatchObject({ code: 'BASE_SKU_TAKEN' });

      await variable('Familia', 'FAM', ['FAM-1']);
      await expect(simple('FAM')).rejects.toMatchObject({ code: 'SKU_TAKEN' });
      await expect(simple('fam')).rejects.toMatchObject({ code: 'SKU_TAKEN' });
    });

    it('cambiar el SKU base a uno ajeno responde BASE_SKU_TAKEN y no cambia nada', async () => {
      await variable('Chaqueta', 'CHA', ['CHA-1']);
      const product = await variable('Abrigo', 'ABR', ['ABR-1']);

      await expect(update(product.id, { baseSku: 'cha' })).rejects.toMatchObject({ code: 'BASE_SKU_TAKEN' });
      expect(await baseSkuOf(product.id)).toBe('ABR');
      expect(await skusOf(product.id)).toEqual(['ABR-1']);
      await expect(update(product.id, { baseSku: 'ABR' })).resolves.toBeDefined(); // conservar el propio no cuenta
    });

    it('al cambiar el SKU de un producto simple, su SKU base lo sigue y el código anterior queda libre', async () => {
      const product = await simple('VIEJO-1');
      expect(await baseSkuOf(product.id)).toBe('VIEJO-1');

      await editSku(product.id, 'nuevo-1');
      expect(await baseSkuOf(product.id)).toBe('NUEVO-1');
      await expect(simple('VIEJO-1')).resolves.toBeDefined();
    });

    it('lo mismo al editar la variante de un producto simple; en un producto con variantes el SKU base no se toca', async () => {
      const single = await simple('VAR-S1');
      const [singleVariant] = await db.getRepository(ProductVariant).findBy({ productId: single.id });
      await new UpdateVariantHandler(db.manager).execute(new UpdateVariantCommand(shop.tenantId, singleVariant.id, 'VAR-S2'));
      expect(await baseSkuOf(single.id)).toBe('VAR-S2');

      const family = await variable('Camiseta', 'CMS', ['CMS-1', 'CMS-2']);
      const [firstVariant] = await db.getRepository(ProductVariant).find({ where: { productId: family.id }, order: { sku: 'ASC' } });
      await new UpdateVariantHandler(db.manager).execute(new UpdateVariantCommand(shop.tenantId, firstVariant.id, 'CMS-UNO'));
      expect(await baseSkuOf(family.id)).toBe('CMS');
    });

    it('un SKU que falla al editar un producto simple no deja el SKU base cambiado a medias', async () => {
      await simple('PARES-A');
      const product = await simple('PARES-B');

      await expect(editSku(product.id, 'PARES-A')).rejects.toMatchObject({ code: 'SKU_TAKEN' });
      expect(await baseSkuOf(product.id)).toBe('PARES-B');
      expect(await skusOf(product.id)).toEqual(['PARES-B']);
    });

    it('el SKU base no puede coincidir con el SKU de una variante de otro producto: al escanearlo saldría la variante, no la familia', async () => {
      await variable('Pack', 'PACK', ['COMPARTIDO']);
      await expect(variable('Otra familia', 'compartido', ['OTRA-1'])).rejects.toMatchObject({ code: 'BASE_SKU_TAKEN' });

      const product = await variable('Renombrable', 'REN', ['REN-1']);
      await expect(update(product.id, { baseSku: 'COMPARTIDO' })).rejects.toMatchObject({ code: 'BASE_SKU_TAKEN' });
    });

    it('y al revés: el SKU de una variante no puede coincidir con el SKU base de otra familia', async () => {
      const family = await variable('Familia base', 'FAMBASE', ['FAMBASE-1']);
      await expect(variable('Intrusa', 'INTR', ['famBase'])).rejects.toMatchObject({ code: 'SKU_TAKEN', details: { sku: 'FAMBASE' } });

      const other2 = await variable('Segunda', 'SEG', ['SEG-1']);
      const addVariant = (productId: string, sku: string) => new CreateVariantHandler(db.manager).execute(new CreateVariantCommand(shop.tenantId, productId, { sku, purchasePrice: 1, salePrice: 2 }));
      await expect(addVariant(other2.id, 'FAMBASE')).rejects.toMatchObject({ code: 'SKU_TAKEN' });

      const [seg] = await db.getRepository(ProductVariant).findBy({ productId: other2.id });
      await expect(new UpdateVariantHandler(db.manager).execute(new UpdateVariantCommand(shop.tenantId, seg.id, 'FAMBASE'))).rejects.toMatchObject({ code: 'SKU_TAKEN' });
      expect(await skusOf(other2.id)).toEqual(['SEG-1']);

      // Una variante con el mismo SKU que la base de su propia familia sí es válida
      await expect(addVariant(family.id, 'FAMBASE')).resolves.toMatchObject({ sku: 'FAMBASE' });
    });

    it('un producto eliminado libera su SKU base', async () => {
      const product = await variable('Temporal', 'TMP', ['TMP-1']);
      await new DeleteProductHandler(db.manager).execute(new DeleteProductCommand(shop.tenantId, product.id));
      await expect(variable('Temporal 2', 'TMP', ['TMP-1'])).resolves.toBeDefined();
    });

    it('el mismo SKU base en otra tienda es válido', async () => {
      await variable('Gemelo', 'GEM', ['GEM-1']);
      await expect(variable('Gemelo', 'GEM', ['GEM-1'], other)).resolves.toBeDefined();
    });

    it('altas simultáneas con el mismo SKU base: una gana y la otra recibe un error de negocio, no un 500', async () => {
      const results = await Promise.allSettled([variable('Carrera A', 'RACE', ['RACE-A']), variable('Carrera B', 'RACE', ['RACE-B'])]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(['BASE_SKU_TAKEN', 'SKU_TAKEN']).toContain((failure?.reason as { code?: string }).code);
      expect(await db.getRepository(Product).countBy({ tenantId: shop.tenantId, baseSku: 'RACE' })).toBe(1);
    });
  });

  describe('migración del SKU base único', () => {
    it('realinea los productos simples, se detiene si quedan repetidos y se aplica al resolverlos', async () => {
      const indexExists = async () => (await db.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'UQ_products_tenant_base_sku_ci'`)).length > 0;
      for (let undone = 0; undone < 10 && (await indexExists()); undone++) {
        await db.undoLastMigration();
      }

      const drifted = await simple('MIG-1');
      await db.query(`UPDATE products SET base_sku = 'anterior-viejo' WHERE id = $1`, [drifted.id]);
      const a = await simple('MIG-DUP-A');
      const b = await simple('MIG-DUP-B');
      await db.query(`UPDATE products SET base_sku = 'dup-x' WHERE id IN ($1, $2)`, [a.id, b.id]);
      // Con la desalineación de por medio, los dos simples volverán a su SKU real y dejarán de repetirse;
      // se fuerza el repetido en un producto con variantes, que la migración no toca
      const f1 = await variable('Repetida 1', 'REPETIDA-1', ['REP-1']);
      const f2 = await variable('Repetida 2', 'REPETIDA-2', ['REP-2']);
      await db.query(`UPDATE products SET base_sku = 'repetida-x' WHERE id IN ($1, $2)`, [f1.id, f2.id]);

      await expect(db.runMigrations()).rejects.toThrow(/SKUs base de producto repetidos.*REPETIDA-X/);
      expect(await indexExists()).toBe(false);

      await db.query(`UPDATE products SET base_sku = 'REPETIDA-2' WHERE id = $1`, [f2.id]);
      await db.runMigrations();
      expect(await indexExists()).toBe(true);
      expect(await baseSkuOf(drifted.id)).toBe('MIG-1');
      expect(await baseSkuOf(a.id)).toBe('MIG-DUP-A');
    });
  });
});
