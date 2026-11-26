import { DataSource, In } from 'typeorm';
import { AddAttributeValueSortOrder1794300000000 } from '../../src/database/migrations/1794300000000-AddAttributeValueSortOrder';
import { CreateAttributeCommand } from '../../src/modules/products/application/commands/create-attribute/create-attribute.command';
import { CreateAttributeHandler } from '../../src/modules/products/application/commands/create-attribute/create-attribute.handler';
import { CreateAttributeValueCommand } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.command';
import { CreateAttributeValueHandler } from '../../src/modules/products/application/commands/create-attribute-value/create-attribute-value.handler';
import { DeleteAttributeValueCommand } from '../../src/modules/products/application/commands/delete-attribute-value/delete-attribute-value.command';
import { DeleteAttributeValueHandler } from '../../src/modules/products/application/commands/delete-attribute-value/delete-attribute-value.handler';
import { ImportVariantProductsCommand } from '../../src/modules/products/application/commands/import-variant-products/import-variant-products.command';
import { ImportVariantProductsHandler } from '../../src/modules/products/application/commands/import-variant-products/import-variant-products.handler';
import { ReorderAttributeValuesCommand } from '../../src/modules/products/application/commands/reorder-attribute-values/reorder-attribute-values.command';
import { ReorderAttributeValuesHandler } from '../../src/modules/products/application/commands/reorder-attribute-values/reorder-attribute-values.handler';
import { GetAttributesHandler } from '../../src/modules/products/application/queries/get-attributes/get-attributes.handler';
import { GetAttributesQuery } from '../../src/modules/products/application/queries/get-attributes/get-attributes.query';
import { AttributeValue } from '../../src/modules/products/domain/entities/attribute-value.entity';
import { ImportRow } from '../../src/modules/products/domain/import-plan';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Orden propio de las opciones de un atributo (S, M, L, XL…). */
describe('Orden de las opciones de un atributo', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const newAttribute = async (name: string, values: string[], tenant = shop) => {
    const attribute = await new CreateAttributeHandler(db.manager).execute(new CreateAttributeCommand(tenant.tenantId, name));
    const ids: string[] = [];
    for (const value of values) ids.push((await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(tenant.tenantId, attribute.id, value))).id);
    return { attributeId: attribute.id, valueIds: ids };
  };
  const listedValues = async (attributeId: string, tenant = shop): Promise<string[]> => {
    const attributes = await new GetAttributesHandler(db.manager).execute(new GetAttributesQuery(tenant.tenantId));
    return (attributes.find((attribute) => attribute.id === attributeId)?.values ?? []).map((value) => value.value);
  };
  const reorder = (attributeId: string, valueIds: string[], tenant = shop) => new ReorderAttributeValuesHandler(db.manager).execute(new ReorderAttributeValuesCommand(tenant.tenantId, attributeId, valueIds));

  beforeAll(async () => {
    database = await startTestDatabase('attribute-order');
    db = database.db;
    shop = await seedTenant(db, 'orden');
    other = await seedTenant(db, 'orden-ajena');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('las opciones salen en el orden en que se crearon, y una nueva va al final', async () => {
    const { attributeId } = await newAttribute('Talla', ['S', 'M', 'L']);

    await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, attributeId, 'XL'));

    expect(await listedValues(attributeId)).toEqual(['S', 'M', 'L', 'XL']);
  });

  it('ordenar cambia cómo salen las opciones, y una opción nueva se suma después de las ordenadas', async () => {
    const { attributeId, valueIds } = await newAttribute('Talla ropa', ['L', 'S', 'XL', 'M']);
    const [l, s, xl, m] = valueIds as [string, string, string, string];

    await reorder(attributeId, [s, m, l, xl]);
    expect(await listedValues(attributeId)).toEqual(['S', 'M', 'L', 'XL']);

    await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, attributeId, 'XXL'));
    expect(await listedValues(attributeId)).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
  });

  it('el listado obedece al orden guardado aunque las filas se hayan escrito en otro orden', async () => {
    const { attributeId, valueIds } = await newAttribute('Talla invertida', ['A', 'B', 'C']);
    const [a, b, c] = valueIds as [string, string, string];
    // Se escriben primero A y B y al final C: sin ordenar la consulta, saldrían A, B, C
    await db.getRepository(AttributeValue).update({ id: a }, { sortOrder: 3 });
    await db.getRepository(AttributeValue).update({ id: b }, { sortOrder: 2 });
    await db.getRepository(AttributeValue).update({ id: c }, { sortOrder: 1 });

    expect(await listedValues(attributeId)).toEqual(['C', 'B', 'A']);
  });

  it('una opción eliminada no estorba: se ordena el resto y la nueva sigue al final', async () => {
    const { attributeId, valueIds } = await newAttribute('Talla con baja', ['A', 'B', 'C']);
    const [a, b, c] = valueIds as [string, string, string];
    await new DeleteAttributeValueHandler(db.manager).execute(new DeleteAttributeValueCommand(shop.tenantId, b));

    await reorder(attributeId, [c, a]);
    await new CreateAttributeValueHandler(db.manager).execute(new CreateAttributeValueCommand(shop.tenantId, attributeId, 'D'));

    expect(await listedValues(attributeId)).toEqual(['C', 'A', 'D']);
  });

  it('una lista que no es la actual se rechaza sin cambiar nada: falta una opción, sobra una ajena o hay una repetida', async () => {
    const { attributeId, valueIds } = await newAttribute('Talla estricta', ['S', 'M', 'L']);
    const foreign = await newAttribute('Talla ajena', ['Z'], other);
    const [s, m, l] = valueIds as [string, string, string];

    await expect(reorder(attributeId, [l, s])).rejects.toMatchObject({ code: 'ATTRIBUTE_ORDER_STALE' });
    await expect(reorder(attributeId, [l, s, m, ...foreign.valueIds])).rejects.toMatchObject({ code: 'ATTRIBUTE_ORDER_STALE' });
    await expect(reorder(attributeId, [s, s, m, l])).rejects.toMatchObject({ code: 'ATTRIBUTE_ORDER_STALE' });

    expect(await listedValues(attributeId)).toEqual(['S', 'M', 'L']);
  });

  it('un atributo de otra tienda o inexistente responde no encontrado y no se toca', async () => {
    const foreign = await newAttribute('Talla de otra', ['A', 'B'], other);

    await expect(reorder(foreign.attributeId, [...foreign.valueIds].reverse())).rejects.toMatchObject({ code: 'ATTRIBUTE_NOT_FOUND' });
    await expect(reorder('00000000-0000-4000-8000-000000000000', [])).rejects.toMatchObject({ code: 'ATTRIBUTE_NOT_FOUND' });

    expect(await listedValues(foreign.attributeId, other)).toEqual(['A', 'B']);
  });

  it('las opciones que crea la importación siguen el orden del archivo', async () => {
    const rows: ImportRow[] = ['S', 'M', 'L'].map((size, index) => ({
      row: index + 2, name: 'Playera orden', baseSku: 'PLYORD', category: 'Ropa', attributes: [{ name: 'Talla importada', value: size }], sku: `PLYORD-${size}`,
      barcode: '', purchasePrice: 5, salePrice: 12, wholesalePrice: null, quantity: null,
    }));

    await new ImportVariantProductsHandler(db.manager, redisStub).execute(new ImportVariantProductsCommand(shop.tenantId, shop.ownerId, undefined, false, rows));

    const attributes = await new GetAttributesHandler(db.manager).execute(new GetAttributesQuery(shop.tenantId));
    expect(attributes.find((attribute) => attribute.name === 'Talla importada')?.values.map((value) => value.value)).toEqual(['S', 'M', 'L']);
  });

  it('la migración numera las opciones existentes por orden de creación dentro de cada atributo', async () => {
    const first = await newAttribute('Migrado 1', ['uno', 'dos', 'tres']);
    const second = await newAttribute('Migrado 2', ['x', 'y']);
    await db.getRepository(AttributeValue).update({ id: In([...first.valueIds, ...second.valueIds]) }, { sortOrder: 0 }); // como estaban antes de la columna

    const runner = db.createQueryRunner();
    try {
      await new AddAttributeValueSortOrder1794300000000().up(runner);
    } finally {
      await runner.release();
    }

    const orderOf = async (ids: string[]) => (await db.getRepository(AttributeValue).findBy(ids.map((id) => ({ id })))).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((value) => value.sortOrder);
    expect(await orderOf(first.valueIds)).toEqual([1, 2, 3]);
    expect(await orderOf(second.valueIds)).toEqual([1, 2]);
  });
});
