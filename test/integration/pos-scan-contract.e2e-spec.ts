// El entorno se fija antes de cargar AppModule (ver http-test-env)
import { httpDatabaseName, onboardingKey, run } from './support/http-test-env';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request, { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { CASHIER_PERMISSIONS } from '../../src/modules/auth/domain/default-roles';
import { startTestDatabase, TestDatabase } from './support/integration-database';

interface ScannedVariant {
  sku: string;
  stock: number;
  imageUrl: string | null;
  attributes: Array<{ name: string; value: string }>;
  attributeValues?: Array<{ attributeId: string; valueId: string }>;
}

interface ScannedProduct {
  attributes: Array<{ id: string; name: string; values: Array<{ id: string; value: string }> }>;
  variants: ScannedVariant[];
}

/** Lo que recibe el POS al escanear: solo lo que usa (nunca el precio de compra) y solo de sus sucursales. */
describe('API del escaneo del POS (GET /products/pos/variant/sku/:sku)', () => {
  const clientIp = `10.${parseInt(run.slice(0, 2), 16)}.${parseInt(run.slice(2, 4), 16)}.${parseInt(run.slice(4, 6), 16)}`;
  const password = 'clave-segura-123';
  const slug = `tienda-scan-${run}`;
  const variantKeys = ['attributes', 'barcode', 'id', 'imageUrl', 'salePrice', 'sku', 'stock', 'wholesalePrice'];

  let database: TestDatabase;
  let app: NestExpressApplication;
  let ownerToken: string;
  let cashierToken: string;
  let branchId: string;
  let otherBranchId: string;
  const attributeIds: Record<string, string> = {};

  const api = (method: 'get' | 'post' | 'put', path: string, token?: string) => {
    const call = request(app.getHttpServer())[method](path).set('X-Forwarded-For', clientIp);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };
  const created = async <T>(path: string, body: object): Promise<T> => {
    const response = await api('post', path, ownerToken).send(body);
    expect(response.status).toBe(201);
    return response.body as T;
  };
  const scan = (code: string, token = ownerToken, branch = branchId): Promise<Response> => api('get', `/products/pos/variant/sku/${code}?branchId=${branch}`, token);
  const scanFamily = async (code: string, token = ownerToken) => (await scan(code, token)).body as ScannedProduct;

  const userWith = async (username: string, permissions: string[]): Promise<string> => {
    const role = await created<{ id: string }>('/roles', { name: `Rol ${username}`, permissions });
    await created('/users', { name: username, username, password, roleId: role.id, branchIds: [branchId] });
    const login = await api('post', '/auth/login').send({ email: username, password, tenantSlug: slug });
    return (login.body as { accessToken: string }).accessToken;
  };

  beforeAll(async () => {
    database = await startTestDatabase('scan', httpDatabaseName);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    const onboard = await api('post', '/auth/onboard')
      .set('x-onboarding-key', onboardingKey)
      .send({
        tenantName: 'Tienda Scan', slug, ruc: `09${run}00000`.slice(0, 13).padEnd(13, '0'), country: 'EC', currencyCode: 'USD', currencySymbol: '$',
        timezone: 'America/Guayaquil', adminName: 'Dueña', username: 'duena', password, branchName: 'Matriz', branchAddress: 'Centro',
      });
    expect(onboard.status).toBe(201);
    branchId = (onboard.body as { branch: { id: string } }).branch.id;
    const login = await api('post', '/auth/login').send({ email: 'duena', password, tenantSlug: slug });
    ownerToken = (login.body as { accessToken: string }).accessToken;
    otherBranchId = (await created<{ id: string }>('/branches', { name: 'Norte', address: 'Calle 2' })).id;

    // Una mochila como la real: Base con 3 opciones, Cierre con 2 y Copa con 1 (se crean en otro orden a propósito)
    const valueIds: Record<string, string> = {};
    for (const [name, values] of [['Copa', ['Negro']], ['Cierre', ['Negro', 'Rojo']], ['Base', ['Verde', 'Negro', 'Rojo']]] as const) {
      attributeIds[name] = (await created<{ id: string }>('/products/attributes', { name })).id;
      for (const value of values) valueIds[`${name}:${value}`] = (await created<{ id: string }>('/products/attributes/values', { attributeId: attributeIds[name], value })).id;
    }
    const variant = (sku: string, base: string, cierre: string, quantity: number) => ({
      sku, purchasePrice: 3.63, salePrice: 10, wholesalePrice: 6.5,
      attributeValues: [`Copa:Negro`, `Cierre:${cierre}`, `Base:${base}`].map((key) => ({ attributeValueId: valueIds[key] })),
      stocks: [{ branchId, quantity }],
    });
    const product = await created<{ id: string }>('/products/variable', {
      name: 'Mochila', description: 'Texto largo que el POS no muestra', baseSku: 'MOC',
      variants: [variant('MOC-10', 'Verde', 'Negro', 4), variant('MOC-2', 'Rojo', 'Rojo', 3), variant('MOC-1', 'Negro', 'Negro', 68)],
    });

    // Foto general del producto y foto propia de MOC-1 (directo en la base: subirlas pasaría por el almacenamiento)
    const [tenant] = await database.db.query<Array<{ tenant_id: string }>>(`SELECT tenant_id FROM products WHERE id = $1`, [product.id]);
    const image = async (url: string): Promise<string> =>
      (await database.db.query<Array<{ id: string }>>(`INSERT INTO product_images (tenant_id, url) VALUES ($1, $2) RETURNING id`, [tenant.tenant_id, url]))[0].id;
    await database.db.query(`INSERT INTO product_image_mappings (product_id, product_image_id) VALUES ($1, $2)`, [product.id, await image('general.jpg')]);
    await database.db.query(
      `INSERT INTO product_variant_image_mappings (product_variant_id, product_image_id) SELECT id, $1 FROM product_variants WHERE sku = 'MOC-1'`,
      [await image('moc-1.jpg')],
    );

    cashierToken = await userWith('cajera', CASHIER_PERMISSIONS);
  }, 90000);

  afterAll(async () => {
    await app?.close();
    await database?.destroy();
  });

  describe('SKU de una variante', () => {
    it('trae solo lo que usa el POS, sin las entidades de atributos', async () => {
      const response = await scan('moc-1');

      expect(response.status).toBe(200);
      const [found] = response.body as ScannedVariant[];
      expect(Object.keys(found).sort()).toEqual([...variantKeys, 'productName', 'productType'].sort());
      expect(found).toMatchObject({ sku: 'MOC-1', productName: 'Mochila', productType: 'VARIABLE', salePrice: 10, wholesalePrice: 6.5, stock: 68 });
      expect(found.attributes).toEqual([{ name: 'Base', value: 'Negro' }, { name: 'Cierre', value: 'Negro' }, { name: 'Copa', value: 'Negro' }]);
      expect(found.imageUrl).toContain('moc-1.jpg');
      expect(JSON.stringify(response.body)).not.toMatch(/createdAt|updatedAt|deletedAt|tenantId|sortOrder/);
    });

    it('un código que no existe devuelve una lista vacía', async () => {
      expect((await scan('NO-EXISTE')).body).toEqual([]);
    });
  });

  describe('SKU base del producto', () => {
    it('trae el producto sin descripción y cada variante solo con los ids que necesita el selector', async () => {
      const response = await scan('moc');

      expect(response.status).toBe(200);
      const product = response.body as ScannedProduct;
      expect(Object.keys(product).sort()).toEqual(['attributes', 'baseSku', 'imageUrl', 'productId', 'productName', 'productType', 'variants']);
      expect(Object.keys(product.variants[0]).sort()).toEqual([...variantKeys, 'attributeValues'].sort());
      expect(Object.keys(product.variants[0].attributeValues![0]).sort()).toEqual(['attributeId', 'valueId']);
      expect(JSON.stringify(response.body)).not.toMatch(/createdAt|updatedAt|deletedAt|tenantId|sortOrder|description/);
    });

    it('ordena siempre igual: variantes por SKU (2 antes que 10), atributos con más opciones primero y opciones en su orden', async () => {
      const product = await scanFamily('MOC');

      expect(product.variants.map((v) => v.sku)).toEqual(['MOC-1', 'MOC-2', 'MOC-10']);
      expect(product.attributes.map((a) => a.name)).toEqual(['Base', 'Cierre', 'Copa']);
      expect(product.attributes[0].values.map((v) => v.value)).toEqual(['Verde', 'Negro', 'Rojo']);
    });

    it('cada variante apunta a opciones que existen, con su stock y su foto (o la del producto si no tiene)', async () => {
      const product = await scanFamily('MOC');
      const [first, second] = product.variants;

      const chosen = first.attributeValues!.map(({ attributeId, valueId }) => {
        const attribute = product.attributes.find((a) => a.id === attributeId)!;
        return `${attribute.name}:${attribute.values.find((v) => v.id === valueId)!.value}`;
      });
      expect(chosen.sort()).toEqual(['Base:Negro', 'Cierre:Negro', 'Copa:Negro']);
      expect(first).toMatchObject({ stock: 68 });
      expect(first.imageUrl).toContain('moc-1.jpg');
      expect(second.imageUrl).toContain('general.jpg');
    });
  });

  describe('permisos', () => {
    it('nadie recibe el precio de compra, ni siquiera el propietario', async () => {
      for (const token of [ownerToken, cashierToken]) {
        for (const code of ['MOC-1', 'MOC']) {
          const response = await scan(code, token);
          expect(response.status).toBe(200);
          expect(JSON.stringify(response.body)).not.toContain('purchasePrice');
        }
      }
    });

    it('no se puede consultar una sucursal que no se tiene asignada: 403 BRANCH_ACCESS_DENIED', async () => {
      for (const code of ['MOC-1', 'MOC']) {
        const response = await scan(code, cashierToken, otherBranchId);
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });
      }
      expect((await scan('MOC-1', ownerToken, otherBranchId)).status).toBe(200);
    });

    it('sin sucursal o con una que no es un id responde 400, no un error interno', async () => {
      expect((await api('get', '/products/pos/variant/sku/MOC-1', ownerToken)).status).toBe(400);
      expect((await scan('MOC-1', ownerToken, 'no-uuid')).status).toBe(400);
    });
  });
});
