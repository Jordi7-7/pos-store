import { DataSource } from 'typeorm';
import { DeleteImageCommand } from '../../src/modules/media/application/commands/delete-image/delete-image.command';
import { DeleteImageHandler } from '../../src/modules/media/application/commands/delete-image/delete-image.handler';
import { RegisterImageCommand } from '../../src/modules/media/application/commands/register-image/register-image.command';
import { RegisterImageHandler } from '../../src/modules/media/application/commands/register-image/register-image.handler';
import { UploadImageByUrlCommand } from '../../src/modules/media/application/commands/upload-image-by-url/upload-image-by-url.command';
import { UploadImageByUrlHandler } from '../../src/modules/media/application/commands/upload-image-by-url/upload-image-by-url.handler';
import { ListImagesHandler } from '../../src/modules/media/application/queries/list-images/list-images.handler';
import { ListImagesQuery } from '../../src/modules/media/application/queries/list-images/list-images.query';
import { S3Service } from '../../src/modules/media/services/s3.service';
import { ProductImage } from '../../src/modules/products/domain/entities/product-image.entity';
import { CreateSimpleProductCommand } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.command';
import { CreateSimpleProductHandler } from '../../src/modules/products/application/commands/create-simple-product/create-simple-product.handler';
import { UpdateProductCommand } from '../../src/modules/products/application/commands/update-product/update-product.command';
import { UpdateProductHandler } from '../../src/modules/products/application/commands/update-product/update-product.handler';
import { seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

// La descarga remota se simula: aquí se prueba qué hace el handler con el resultado, no la red
const mockFetchRemoteImage = jest.fn();
jest.mock('../../src/modules/media/services/safe-image-fetcher', () => ({
  fetchRemoteImage: (url: string): Promise<unknown> => mockFetchRemoteImage(url) as Promise<unknown>,
}));

/** Galería de imágenes con los handlers reales sobre Postgres; solo el almacenamiento remoto es falso. */
describe('Media: galería de imágenes', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const stored: string[] = [];
  const deleted: string[] = [];
  const s3 = Object.assign(Object.create(S3Service.prototype) as S3Service, {
    uploadFileBuffer: (tenantId: string, filename: string): Promise<string> => {
      const url = `https://cdn.example.com/${s3.tenantKeyPrefix(tenantId)}products/${filename}?sig=abc`;
      stored.push(url);
      return Promise.resolve(url);
    },
    deleteFile: (url: string): Promise<void> => {
      deleted.push(url);
      return Promise.resolve();
    },
  });
  const ownKey = (tenant: SeededTenant, name: string) => `${s3.tenantKeyPrefix(tenant.tenantId)}products/${name}`;

  const register = (tenant: SeededTenant, url: string, description?: string) => new RegisterImageHandler(db.manager, s3).execute(new RegisterImageCommand(tenant.tenantId, url, description));
  const list = (tenant: SeededTenant, page?: number, limit?: number, search?: string) => new ListImagesHandler(db.manager).execute(new ListImagesQuery(tenant.tenantId, page, limit, search));
  const remove = (tenant: SeededTenant, id: string) => new DeleteImageHandler(db.manager, s3).execute(new DeleteImageCommand(tenant.tenantId, id));
  const upload = (tenant: SeededTenant, url: string, description?: string) => new UploadImageByUrlHandler(db.manager, s3).execute(new UploadImageByUrlCommand(tenant.tenantId, url, description));

  beforeAll(async () => {
    database = await startTestDatabase('media');
    db = database.db;
    shop = await seedTenant(db, 'galeria');
    other = await seedTenant(db, 'galeria-aj');
  }, 60000);

  beforeEach(() => {
    mockFetchRemoteImage.mockReset();
    stored.length = 0;
    deleted.length = 0;
  });

  afterAll(async () => {
    await database?.destroy();
  });

  describe('registrar y listar', () => {
    it('registra una imagen del propio espacio con la URL limpia; la de otra tienda se rechaza', async () => {
      const image = await register(shop, `https://cdn.example.com/${ownKey(shop, 'a.png')}?X-Amz-Signature=zzz`, 'Camisa roja');
      expect(image).toMatchObject({ tenantId: shop.tenantId, description: 'Camisa roja' });
      expect(image.url).not.toContain('?');

      await expect(register(shop, `https://cdn.example.com/${ownKey(other, 'b.png')}`)).rejects.toMatchObject({ code: 'MEDIA_NOT_OWNED' });
      expect(await db.getRepository(ProductImage).countBy({ tenantId: shop.tenantId })).toBe(1);
    });

    it('lista solo la galería de la tienda, la más reciente primero, con paginación', async () => {
      await register(shop, `https://cdn.example.com/${ownKey(shop, 'b.png')}`, 'Pantalón azul');
      await register(shop, `https://cdn.example.com/${ownKey(shop, 'c.png')}`, '100% algodón');
      await register(other, `https://cdn.example.com/${ownKey(other, 'x.png')}`, 'De la competencia');

      const all = await list(shop);
      expect(all.data.map((i) => i.description)).toEqual(['100% algodón', 'Pantalón azul', 'Camisa roja']);
      expect(all.meta).toMatchObject({ total: 3, page: 1, totalPages: 1 });

      const second = await list(shop, 2, 2);
      expect(second.data.map((i) => i.description)).toEqual(['Camisa roja']);
      expect(second.meta).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect((await list(other)).data.map((i) => i.description)).toEqual(['De la competencia']);
    });

    it('la búsqueda ignora mayúsculas y los comodines del usuario se buscan como texto', async () => {
      expect((await list(shop, 1, 20, 'PANTALÓN')).data.map((i) => i.description)).toEqual(['Pantalón azul']);
      expect((await list(shop, 1, 20, '%')).data.map((i) => i.description)).toEqual(['100% algodón']);
      expect((await list(shop, 1, 20, '_')).data).toEqual([]);
    });
  });

  describe('subir por URL', () => {
    it('guarda lo descargado en el espacio de la tienda y registra la imagen', async () => {
      mockFetchRemoteImage.mockResolvedValue({ buffer: Buffer.from('png'), contentType: 'image/png' });
      const image = await upload(shop, 'https://example.org/fotos/gorra.png?w=300', 'Gorra');

      expect(mockFetchRemoteImage).toHaveBeenCalledWith('https://example.org/fotos/gorra.png?w=300');
      expect(stored[0]).toContain(`/${s3.tenantKeyPrefix(shop.tenantId)}products/gorra.png`);
      expect(image).toMatchObject({ tenantId: shop.tenantId, description: 'Gorra' });
      expect(image.url).toContain('gorra.png');
      expect(image.url).not.toContain('?');
    });

    it('sin nombre de archivo en la URL usa uno por defecto, y sin descripción pone la de siempre', async () => {
      mockFetchRemoteImage.mockResolvedValue({ buffer: Buffer.from('jpg'), contentType: 'image/jpeg' });
      const image = await upload(shop, 'https://example.org/imagen');

      expect(stored[0]).toContain('downloaded-image.jpg');
      expect(image.description).toBe('Imagen arrastrada de internet');
    });

    it('si la descarga segura rechaza la URL no se guarda nada', async () => {
      mockFetchRemoteImage.mockRejectedValue(Object.assign(new Error('bloqueada'), { code: 'IMAGE_URL_BLOCKED' }));
      const before = await db.getRepository(ProductImage).countBy({ tenantId: shop.tenantId });

      await expect(upload(shop, 'http://169.254.169.254/latest/meta-data')).rejects.toMatchObject({ code: 'IMAGE_URL_BLOCKED' });
      expect(await db.getRepository(ProductImage).countBy({ tenantId: shop.tenantId })).toBe(before);
      expect(stored).toEqual([]);
    });
  });

  describe('eliminar', () => {
    it('una imagen libre se elimina del registro y del almacenamiento', async () => {
      const image = await register(shop, `https://cdn.example.com/${ownKey(shop, 'libre.png')}`, 'Libre');
      await expect(remove(shop, image.id)).resolves.toMatchObject({ success: true });

      expect(deleted).toHaveLength(1);
      expect(await db.getRepository(ProductImage).findOneBy({ id: image.id })).toBeNull();
    });

    it('una imagen asignada a un producto no se elimina hasta quitarla (MEDIA_IN_USE) y nada se borra del bucket', async () => {
      const image = await register(shop, `https://cdn.example.com/${ownKey(shop, 'usada.png')}`, 'Usada');
      const product = await new CreateSimpleProductHandler(db.manager).execute(new CreateSimpleProductCommand(shop.tenantId, 'Con foto', 'desc', 'FOTO-1', '', 1, 2));
      await new UpdateProductHandler(db.manager).execute(new UpdateProductCommand(shop.tenantId, product.id, undefined, undefined, [image.id]));

      await expect(remove(shop, image.id)).rejects.toMatchObject({ code: 'MEDIA_IN_USE' });
      expect(deleted).toEqual([]);
      expect(await db.getRepository(ProductImage).findOneBy({ id: image.id })).not.toBeNull();

      await new UpdateProductHandler(db.manager).execute(new UpdateProductCommand(shop.tenantId, product.id, undefined, undefined, []));
      await expect(remove(shop, image.id)).resolves.toMatchObject({ success: true });
    });

    it('la imagen de otra tienda no existe para quien intenta borrarla', async () => {
      const foreign = await register(other, `https://cdn.example.com/${ownKey(other, 'ajena.png')}`, 'Ajena');
      await expect(remove(shop, foreign.id)).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });
      expect(await db.getRepository(ProductImage).findOneBy({ id: foreign.id })).not.toBeNull();
      expect(deleted).toEqual([]);
    });
  });
});
