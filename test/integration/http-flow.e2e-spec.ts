// El entorno se fija antes de cargar AppModule (ver http-test-env)
import { httpDatabaseName, onboardingKey, run } from './support/http-test-env';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request, { Response } from 'supertest';
import { APP_PERMISSIONS } from '../../src/common/enums/permissions.enum';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * Recorre la API por HTTP con la configuración real (validación, guards, filtro de errores y
 * cabeceras de seguridad): onboarding, login, caja, producto, venta, devolución y cierre. Es lo
 * que consumen el front web y el móvil, así que aquí se fija el contrato de respuestas y errores.
 */
describe('API por HTTP: flujo completo y contrato de errores', () => {
  // La IP del cliente es la última entrada de X-Forwarded-For (TRUST_PROXY=1): una distinta por
  // ejecución evita que los contadores de intentos de Redis de otras corridas afecten a estas pruebas.
  const clientIp = `10.${parseInt(run.slice(0, 2), 16)}.${parseInt(run.slice(2, 4), 16)}.${parseInt(run.slice(4, 6), 16)}`;
  const password = 'clave-segura-123';
  const slug = `tienda-http-${run}`;

  let database: TestDatabase;
  let app: NestExpressApplication;
  let ownerToken: string;
  let ownerRefresh: string;
  let branchId: string;
  let cashRegisterId: string;
  let variantId: string;
  let sessionId: string;
  let saleId: string;

  const api = (method: 'get' | 'post' | 'put' | 'delete', path: string, token?: string, ip = clientIp) => {
    const call = request(app.getHttpServer())[method](path).set('X-Forwarded-For', ip);
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  const expectErrorEnvelope = (response: Response, status: number, code: string): void => {
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ statusCode: status, code, path: expect.any(String) as string, timestamp: expect.any(String) as string });
    expect(typeof (response.body as { message: unknown }).message).toBe('string');
    expect((response.body as { requestId: string }).requestId).toBe(response.headers['x-request-id']);
  };

  beforeAll(async () => {
    database = await startTestDatabase('http', httpDatabaseName);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  }, 90000);

  afterAll(async () => {
    await app?.close();
    await database?.destroy();
  });

  it('GET /health es público y confirma que la API llega a la base de datos', async () => {
    const response = await api('get', '/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  describe('alta de la tienda y sesión', () => {
    it('el onboarding exige la clave y crea tienda, sucursal y propietario', async () => {
      const body = {
        tenantName: 'Tienda HTTP',
        slug,
        ruc: `09${run}00000`.slice(0, 13).padEnd(13, '0'),
        country: 'EC',
        currencyCode: 'USD',
        currencySymbol: '$',
        timezone: 'America/Guayaquil',
        adminName: 'Dueña',
        username: 'duena',
        password,
        branchName: 'Matriz',
        branchAddress: 'Centro',
      };

      expectErrorEnvelope(await api('post', '/auth/onboard').send(body), 401, 'ONBOARDING_UNAUTHORIZED');

      const created = await api('post', '/auth/onboard').set('x-onboarding-key', onboardingKey).send(body);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ tenant: { slug }, user: { username: 'duena', isOwner: true }, branch: { name: 'Matriz' } });
      branchId = (created.body as { branch: { id: string } }).branch.id;
    });

    it('login: devuelve los tokens y nunca la contraseña', async () => {
      const response = await api('post', '/auth/login').send({ email: 'DUENA', password, tenantSlug: slug });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
      ownerToken = (response.body as { accessToken: string }).accessToken;
      ownerRefresh = (response.body as { refreshToken: string }).refreshToken;
    });

    it('el perfil trae al propietario con acceso total, su tienda y sucursales, sin datos sensibles', async () => {
      const response = await api('get', '/auth/profile', ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        username: 'duena',
        isOwner: true,
        permissions: ['*'],
        tenant: { slug, currencyCode: 'USD' },
        branches: [{ id: branchId, name: 'Matriz' }],
      });
      expect(JSON.stringify(response.body)).not.toMatch(/password|"pin"/i);
    });

    it('refresh rota los tokens y el anterior deja de servir (reutilización detectada)', async () => {
      const rotated = await api('post', '/auth/refresh').send({ refreshToken: ownerRefresh });
      expect(rotated.status).toBe(200);
      const next = rotated.body as { accessToken: string; refreshToken: string };
      expect(next.refreshToken).not.toBe(ownerRefresh);

      expectErrorEnvelope(await api('post', '/auth/refresh').send({ refreshToken: ownerRefresh }), 401, 'SESSION_EXPIRED');
      // reutilizar el viejo revoca la sesión: el nuevo tampoco sirve
      expectErrorEnvelope(await api('post', '/auth/refresh').send({ refreshToken: next.refreshToken }), 401, 'SESSION_EXPIRED');

      const again = await api('post', '/auth/login').send({ email: 'duena', password, tenantSlug: slug });
      ownerToken = (again.body as { accessToken: string }).accessToken;
    });
  });

  describe('flujo de caja: producto, apertura, venta, devolución y cierre', () => {
    it('crea la caja y un producto con stock inicial', async () => {
      const register = await api('post', '/cash-registers', ownerToken).send({ branchId, name: 'Caja 1' });
      expect(register.status).toBe(201);
      cashRegisterId = (register.body as { id: string }).id;

      const product = await api('post', '/products/simple', ownerToken).send({
        name: 'Camisa',
        description: 'Camisa de algodón',
        sku: 'HTTP-1',
        purchasePrice: 4,
        salePrice: 10,
        stocks: [{ branchId, quantity: 20 }],
      });
      expect(product.status).toBe(201);
      variantId = (product.body as { variants: Array<{ id: string }> }).variants[0].id;
    });

    it('abre la sesión de caja', async () => {
      const response = await api('post', '/sales/cash-sessions/open', ownerToken).send({ branchId, cashRegisterId, openingBalance: 50 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'OPEN', openingBalance: 50, branch: { id: branchId }, cashRegister: { id: cashRegisterId } });
      sessionId = (response.body as { id: string }).id;

      const active = await api('get', `/sales/cash-sessions/active?branchId=${branchId}&cashRegisterId=${cashRegisterId}`, ownerToken);
      expect(active.status).toBe(200);
      expect(active.body).toMatchObject({ id: sessionId });
    });

    it('vende: número de factura, totales exactos y stock descontado', async () => {
      const response = await api('post', '/sales', ownerToken).send({
        branchId,
        cashSessionId: sessionId,
        items: [{ variantId, quantity: 3, price: 10 }],
        payments: [{ paymentMethod: 'EFECTIVO', amount: 30 }],
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ invoiceNumber: '001-001-000000001', total: 30, status: 'COMPLETED' });
      saleId = (response.body as { id: string }).id;
    });

    it('un pago que no cubre el total responde INSUFFICIENT_PAYMENT', async () => {
      const response = await api('post', '/sales', ownerToken).send({
        branchId,
        cashSessionId: sessionId,
        items: [{ variantId, quantity: 1, price: 10 }],
        payments: [{ paymentMethod: 'EFECTIVO', amount: 5 }],
      });

      expectErrorEnvelope(response, 400, 'INSUFFICIENT_PAYMENT');
    });

    it('devuelve una unidad y marca la venta como parcialmente devuelta', async () => {
      const response = await api('post', '/sales/refunds', ownerToken).send({
        branchId,
        saleId,
        cashSessionId: sessionId,
        reason: 'Talla equivocada',
        items: [{ variantId, quantity: 1 }],
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ totalRefunded: 10, reason: 'Talla equivocada' });
      const sale = await api('get', '/sales/invoice/001-001-000000001', ownerToken);
      expect(sale.body).toMatchObject({ status: 'PARTIALLY_REFUNDED' });
    });

    it('el detalle de la sesión cuadra: ventas, devoluciones y efectivo esperado', async () => {
      const response = await api('get', `/sales/cash-sessions/${sessionId}/details`, ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        kpis: { grossSales: 30, netSales: 20, cashSales: 30, totalRefunds: 10, salesCount: 1, refundsCount: 1 },
        session: { openingBalance: 50, expectedBalance: 70 },
      });
    });

    it('cierra la caja sin diferencia', async () => {
      const response = await api('post', `/sales/cash-sessions/${sessionId}/close`, ownerToken).send({ closingBalance: 70 });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'CLOSED', closingBalance: 70, expectedBalance: 70, difference: 0 });
    });

    it('el dashboard y los listados reflejan la jornada', async () => {
      const dashboard = await api('get', `/dashboard/metrics?branchId=${branchId}`, ownerToken);
      expect(dashboard.status).toBe(200);
      expect(dashboard.body).toMatchObject({ today: { totalSales: 30, refunds: { totalRefunded: 10 } }, paymentMethods: { cash: { amount: 30 } } });

      const products = await api('get', '/products?page=1&limit=10', ownerToken);
      expect(products.body).toMatchObject({ meta: { total: 1, page: 1, limit: 10 } });

      const sales = await api('get', '/sales/paginated?page=1&limit=10', ownerToken);
      expect(sales.status).toBe(200);
      expect((sales.body as { data: unknown[] }).data).toHaveLength(1);

      const sessions = await api('get', `/sales/cash-sessions?branchId=${branchId}`, ownerToken);
      expect(sessions.body).toMatchObject([{ id: sessionId, status: 'CLOSED', totalSales: 20 }]);
    });
  });

  describe('contrato de errores', () => {
    it('sin token: 401 AUTH_TOKEN_MISSING; con token inválido: 401 AUTH_TOKEN_INVALID', async () => {
      expectErrorEnvelope(await api('get', '/branches'), 401, 'AUTH_TOKEN_MISSING');
      expectErrorEnvelope(await api('get', '/branches', 'no-es-un-token'), 401, 'AUTH_TOKEN_INVALID');
    });

    it('cuerpo inválido: 400 VALIDATION_FAILED con la lista de errores por campo', async () => {
      const response = await api('post', '/products/simple', ownerToken).send({ name: 'Sin SKU', description: 'x', purchasePrice: 'caro', salePrice: 10 });

      expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
      expect(Array.isArray((response.body as { details: unknown }).details)).toBe(true);
      expect((response.body as { details: string[] }).details.length).toBeGreaterThan(0);
    });

    it('los campos que no están en el DTO se descartan en lugar de rechazar la petición', async () => {
      const response = await api('post', '/auth/login').send({ email: 'duena', password, tenantSlug: slug, rol: 'admin', isOwner: true });
      expect(response.status).toBe(200);
    });

    it('SKU repetido: 409 SKU_TAKEN con el SKU en details', async () => {
      const response = await api('post', '/products/simple', ownerToken).send({ name: 'Otra', description: 'x', sku: 'HTTP-1', purchasePrice: 1, salePrice: 2 });

      expectErrorEnvelope(response, 409, 'SKU_TAKEN');
      expect(response.body).toMatchObject({ details: { sku: 'HTTP-1' } });
    });

    it('un recurso inexistente: 404 con el mismo formato', async () => {
      expectErrorEnvelope(await api('get', '/sales/cash-sessions/00000000-0000-4000-8000-000000000000/details', ownerToken), 404, 'CASH_SESSION_NOT_FOUND');
      expectErrorEnvelope(await api('get', '/ruta-que-no-existe', ownerToken), 404, 'NOT_FOUND');
    });

    it('un usuario con un rol limitado recibe 403 PERMISSION_DENIED en lo que no le corresponde', async () => {
      const role = await api('post', '/roles', ownerToken).send({ name: 'Solo ver POS', permissions: [APP_PERMISSIONS.VIEW_POS] });
      expect(role.status).toBe(201);
      const user = await api('post', '/users', ownerToken).send({ name: 'Caja', username: 'cajero1', password, roleId: (role.body as { id: string }).id, branchIds: [branchId] });
      expect(user.status).toBe(201);
      expect(JSON.stringify(user.body)).not.toMatch(/password|"pin"/i);

      const login = await api('post', '/auth/login').send({ email: 'cajero1', password, tenantSlug: slug });
      const cashierToken = (login.body as { accessToken: string }).accessToken;

      expectErrorEnvelope(
        await api('post', '/products/simple', cashierToken).send({ name: 'X', description: 'x', sku: 'NO-PUEDE', purchasePrice: 1, salePrice: 2 }),
        403,
        'PERMISSION_DENIED',
      );
      expectErrorEnvelope(await api('get', '/users', cashierToken), 403, 'PERMISSION_DENIED');
    });

    it('un usuario deshabilitado deja de entrar y no se revela que existe si la contraseña es incorrecta', async () => {
      const users = await api('get', '/users', ownerToken);
      const cashier = (users.body as Array<{ id: string; username: string }>).find((candidate) => candidate.username === 'cajero1');
      await api('put', `/users/${cashier?.id}`, ownerToken).send({ isActive: false });

      expectErrorEnvelope(await api('post', '/auth/login').send({ email: 'cajero1', password, tenantSlug: slug }), 401, 'USER_DISABLED');
      expectErrorEnvelope(await api('post', '/auth/login').send({ email: 'cajero1', password: 'incorrecta-1', tenantSlug: slug }), 401, 'INVALID_CREDENTIALS');
    });

    it('tras demasiados intentos fallidos el login responde 429 TOO_MANY_ATTEMPTS, incluso con la clave correcta', async () => {
      const attackerIp = `172.16.${parseInt(run.slice(0, 2), 16)}.${parseInt(run.slice(2, 4), 16)}`;
      for (let attempt = 0; attempt < 5; attempt++) {
        expectErrorEnvelope(await api('post', '/auth/login', undefined, attackerIp).send({ email: 'duena', password: 'incorrecta-1', tenantSlug: slug }), 401, 'INVALID_CREDENTIALS');
      }

      expectErrorEnvelope(await api('post', '/auth/login', undefined, attackerIp).send({ email: 'duena', password, tenantSlug: slug }), 429, 'TOO_MANY_ATTEMPTS');
    });
  });

  describe('cabeceras de seguridad', () => {
    it('helmet las añade y no se anuncia el framework', async () => {
      const response = await api('get', '/branches', ownerToken);

      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toBeDefined();
    });
  });
});
