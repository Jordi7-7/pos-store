import { DataSource } from 'typeorm';
import { AssignProductImagesCommand, ImageAssignment } from '../../src/modules/products/application/commands/assign-product-images/assign-product-images.command';
import { AssignProductImagesHandler } from '../../src/modules/products/application/commands/assign-product-images/assign-product-images.handler';
import { ImportVariantProductsCommand } from '../../src/modules/products/application/commands/import-variant-products/import-variant-products.command';
import { ImportVariantProductsHandler } from '../../src/modules/products/application/commands/import-variant-products/import-variant-products.handler';
import { MatchImageFilesHandler } from '../../src/modules/products/application/queries/match-image-files/match-image-files.handler';
import { MatchImageFilesQuery } from '../../src/modules/products/application/queries/match-image-files/match-image-files.query';
import { ProductImage } from '../../src/modules/products/domain/entities/product-image.entity';
import { ProductVariant } from '../../src/modules/products/domain/entities/product-variant.entity';
import { Product } from '../../src/modules/products/domain/entities/product.entity';
import { ImportRow } from '../../src/modules/products/domain/import-plan';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Subida masiva de fotos (emparejar por nombre y asignar) con los handlers reales sobre Postgres. */
describe('Fotos por nombre de archivo', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const match = (fileNames: string[], tenant = shop) => new MatchImageFilesHandler(db.manager).execute(new MatchImageFilesQuery(tenant.tenantId, fileNames));
  const assign = (items: ImageAssignment[], tenant = shop) => new AssignProductImagesHandler(db.manager).execute(new AssignProductImagesCommand(tenant.tenantId, items));
  const newImage = async (tenant = shop): Promise<string> => (await db.getRepository(ProductImage).save({ tenantId: tenant.tenantId, url: `fotos/${Math.random()}.jpg` })).id;
  const product = (baseSku: string) => db.getRepository(Product).findOneOrFail({ where: { tenantId: shop.tenantId, baseSku }, relations: { images: true } });
  const variant = (sku: string) => db.getRepository(ProductVariant).findOneOrFail({ where: { tenantId: shop.tenantId, sku }, relations: { images: true } });
  const ids = (owner: { images: ProductImage[] }) => owner.images.map((image) => image.id).sort();

  beforeAll(async () => {
    database = await startTestDatabase('image-files');
    db = database.db;
    shop = await seedTenant(db, 'fotos');
    other = await seedTenant(db, 'fotos-ajena');
    const row = (line: number, overrides: Partial<ImportRow>): ImportRow => ({ row: line, name: 'Mochila KTM', baseSku: 'MOCH-KTM', category: '', attributes: [], sku: '', barcode: '', purchasePrice: 5, salePrice: 10, wholesalePrice: null, quantity: 0, ...overrides });
    await new ImportVariantProductsHandler(db.manager, redisStub).execute(
      new ImportVariantProductsCommand(shop.tenantId, shop.ownerId, shop.branchId, false, [
        row(2, { sku: 'MOCH-KTM-01', attributes: [{ name: 'Diseño', value: '01' }] }),
        row(3, { sku: 'MOCH-KTM-02', attributes: [{ name: 'Diseño', value: '02' }] }),
        row(4, { name: 'Llavero', baseSku: '', sku: 'LLAVERO' }),
      ]),
    );
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('empareja por SKU, por nombre y por nombre más diseño, y dice lo que no encuentra', async () => {
    const results = await match(['moch-ktm-01.jpg', 'Mochila KTM 02.jpg', 'mochila ktm.jpg', 'llavero_2.jpg', 'IMG_001.jpg']);

    const first = await variant('MOCH-KTM-01');
    const second = await variant('MOCH-KTM-02');
    expect(results.map((result) => [result.status, result.candidates[0]?.variantId ?? result.candidates[0]?.productId ?? null])).toEqual([
      ['MATCHED', first.id],
      ['MATCHED', second.id],
      ['MATCHED', first.productId],
      ['MATCHED', (await product('LLAVERO')).id],
      ['NOT_FOUND', null],
    ]);
  });

  it('no encuentra productos de otra tienda', async () => {
    const results = await match(['MOCH-KTM-01.jpg', 'Mochila KTM.jpg'], other);
    expect(results.map((result) => result.status)).toEqual(['NOT_FOUND', 'NOT_FOUND']);
  });

  it('agrega sin quitar las fotos anteriores y repetir no duplica', async () => {
    const { id: variantId } = await variant('MOCH-KTM-01');
    const [first, second] = [await newImage(), await newImage()];

    await assign([{ imageId: first, variantId }]);
    await assign([{ imageId: second, variantId }, { imageId: first, variantId }]);

    expect(ids(await variant('MOCH-KTM-01'))).toEqual([first, second].sort());
    expect(ids(await product('MOCH-KTM'))).toEqual([]);
  });

  it('en un producto con variantes la foto del producto no toca las variantes; en uno simple va a los dos', async () => {
    const [parentPhoto, simplePhoto] = [await newImage(), await newImage()];

    await assign([
      { imageId: parentPhoto, productId: (await product('MOCH-KTM')).id },
      { imageId: simplePhoto, productId: (await product('LLAVERO')).id },
    ]);

    expect(ids(await product('MOCH-KTM'))).toEqual([parentPhoto]);
    expect(ids(await variant('MOCH-KTM-02'))).toEqual([]);
    expect(ids(await product('LLAVERO'))).toEqual([simplePhoto]);
    expect(ids(await variant('LLAVERO'))).toEqual([simplePhoto]);
  });

  it('rechaza fotos o destinos de otra tienda y no deja nada a medias', async () => {
    const { id: variantId } = await variant('MOCH-KTM-02');
    const own = await newImage();
    const foreign = await newImage(other);

    await expect(assign([{ imageId: own, variantId }, { imageId: foreign, variantId }])).rejects.toMatchObject({ code: 'IMAGES_NOT_FOUND' });
    await expect(assign([{ imageId: foreign, variantId }], other)).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    await expect(assign([{ imageId: foreign, productId: (await product('LLAVERO')).id }], other)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    await expect(assign([{ imageId: own }])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(assign([{ imageId: own, variantId, productId: (await product('MOCH-KTM')).id }])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(ids(await variant('MOCH-KTM-02'))).toEqual([]);
  });
});
