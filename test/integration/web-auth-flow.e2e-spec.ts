// El entorno se fija antes de cargar AppModule (ver http-test-env)
import { httpDatabaseName, onboardingKey, run } from './support/http-test-env';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request, { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { startTestDatabase, TestDatabase } from './support/integration-database';

/**
 * Sesión web con cookie HttpOnly: el refresh token nunca viaja en el cuerpo, la cookie lleva los atributos de
 * seguridad, la rotación y la detección de reutilización siguen funcionando, y sin la cabecera de la web
 * (defensa contra CSRF) no se acepta ninguna llamada.
 */
describe('sesión web con cookie (/auth/web)', () => {
  const clientIp = `10.${parseInt(run.slice(0, 2), 16)}.${parseInt(run.slice(2, 4), 16)}.${parseInt(run.slice(4, 6), 16)}`;
  const password = 'clave-segura-123';
  const slug = `tienda-web-${run}`;
  const WEB = { 'X-Requested-With': 'pos-web' };

  let database: TestDatabase;
  let app: NestExpressApplication;

  const web = (path: string, headers: Record<string, string> = WEB) => {
    const call = request(app.getHttpServer()).post(path).set('X-Forwarded-For', clientIp);
    return Object.entries(headers).reduce((chain, [name, value]) => chain.set(name, value), call);
  };

  /** `pos_rt=<token>` de la cabecera Set-Cookie, listo para devolverlo como Cookie. */
  const cookieOf = (response: Response): string => {
    const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
    const line = (setCookie ?? []).find((value) => value.startsWith('pos_rt='));
    if (!line) throw new Error('la respuesta no trae la cookie pos_rt');
    return line.split(';')[0];
  };
  const setCookieLine = (response: Response): string => ((response.headers['set-cookie'] as unknown as string[]) ?? []).find((v) => v.startsWith('pos_rt=')) ?? '';

  beforeAll(async () => {
    database = await startTestDatabase('webauth', httpDatabaseName);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    const created = await request(app.getHttpServer())
      .post('/auth/onboard')
      .set('x-onboarding-key', onboardingKey)
      .set('X-Forwarded-For', clientIp)
      .send({
        tenantName: 'Tienda Web', slug, ruc: `09${run}00000`.slice(0, 13).padEnd(13, '0'), country: 'EC', currencyCode: 'USD', currencySymbol: '$',
        timezone: 'America/Guayaquil', adminName: 'Dueña', username: 'duena', password, branchName: 'Matriz', branchAddress: 'Centro',
      });
    expect(created.status).toBe(201);
  }, 90000);

  afterAll(async () => {
    await app?.close();
    await database?.destroy();
  });

  it('sin la cabecera de la web ningún endpoint de sesión responde (403 FORBIDDEN)', async () => {
    for (const path of ['/auth/web/login', '/auth/web/pin-login', '/auth/web/refresh', '/auth/web/logout']) {
      const response = await web(path, {}).send({ email: 'duena', password, tenantSlug: slug });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('login: el cuerpo trae solo el token de acceso y el refresh va en una cookie HttpOnly SameSite=Strict', async () => {
    const response = await web('/auth/web/login').send({ email: 'DUENA', password, tenantSlug: slug });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accessToken: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toMatch(/refresh/i);
    const line = setCookieLine(response);
    expect(line).toMatch(/^pos_rt=[^;]+/);
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Strict/i);
    expect(line).toMatch(/Path=\/auth\/web/);
    expect(line).toMatch(/Max-Age=\d+/);
    expect(response.headers['cache-control']).toBe('no-store');

    // El token de acceso sirve para el resto de la API, igual que el de /auth/login
    const profile = await request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${(response.body as { accessToken: string }).accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({ username: 'duena' });
  });

  it('login con contraseña mala: 401 INVALID_CREDENTIALS y ninguna cookie', async () => {
    const response = await web('/auth/web/login').send({ email: 'duena', password: 'incorrecta-123', tenantSlug: slug });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('refresh: rota la cookie y entrega un token de acceso nuevo; la cookie vieja deja de servir y revoca la sesión', async () => {
    const login = await web('/auth/web/login').send({ email: 'duena', password, tenantSlug: slug });
    const first = cookieOf(login);

    const rotated = await web('/auth/web/refresh').set('Cookie', first).send();
    expect(rotated.status).toBe(200);
    expect(rotated.body).toEqual({ accessToken: expect.any(String) });
    const second = cookieOf(rotated);
    expect(second).not.toBe(first);

    // Reutilizar la cookie anterior es señal de robo: 401, se quita la cookie y la sesión queda revocada
    const reused = await web('/auth/web/refresh').set('Cookie', first).send();
    expect(reused.status).toBe(401);
    expect(reused.body).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(setCookieLine(reused)).toMatch(/pos_rt=;/);
    const afterRevocation = await web('/auth/web/refresh').set('Cookie', second).send();
    expect(afterRevocation.status).toBe(401);
  });

  it('refresh sin cookie o con una cookie falsa: 401 SESSION_EXPIRED', async () => {
    const without = await web('/auth/web/refresh').send();
    expect(without.status).toBe(401);
    expect(without.body).toMatchObject({ code: 'SESSION_EXPIRED' });

    const forged = await web('/auth/web/refresh').set('Cookie', 'pos_rt=no.es.un.token').send();
    expect(forged.status).toBe(401);
    expect(forged.body).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('el login del móvil (/auth/login) sigue devolviendo los dos tokens en el cuerpo', async () => {
    const mobile = await request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', clientIp).send({ email: 'duena', password, tenantSlug: slug });
    expect(mobile.status).toBe(200);
    expect(mobile.body).toEqual({ accessToken: expect.any(String), refreshToken: expect.any(String) });
  });

  it('logout: revoca la sesión aunque el token de acceso haya vencido y borra la cookie', async () => {
    const login = await web('/auth/web/login').send({ email: 'duena', password, tenantSlug: slug });
    const cookie = cookieOf(login);

    const out = await web('/auth/web/logout').set('Cookie', cookie).send();
    expect(out.status).toBe(200);
    expect(setCookieLine(out)).toMatch(/pos_rt=;/);

    const after = await web('/auth/web/refresh').set('Cookie', cookie).send();
    expect(after.status).toBe(401);
  });

  it('logout sin sesión también responde 200 y borra la cookie', async () => {
    const out = await web('/auth/web/logout').send();
    expect(out.status).toBe(200);
    expect(setCookieLine(out)).toMatch(/pos_rt=;/);
  });

  it('login por PIN: con un PIN incorrecto 401 INVALID_PIN y sin cookie; con el correcto, cookie y token', async () => {
    const owner = await web('/auth/web/login').send({ email: 'duena', password, tenantSlug: slug });
    const token = (owner.body as { accessToken: string }).accessToken;
    const profile = await request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${token}`);
    const ownerId = (profile.body as { id: string }).id;
    const generated = await request(app.getHttpServer()).post(`/users/${ownerId}/generate-pin`).set('X-Forwarded-For', clientIp).set('Authorization', `Bearer ${token}`);
    expect(generated.status).toBe(201);
    const pin = (generated.body as { pin: string }).pin;

    const wrong = await web('/auth/web/pin-login').send({ pin: pin === '1234' ? '4321' : '1234', tenantSlug: slug });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toMatchObject({ code: 'INVALID_PIN' });
    expect(wrong.headers['set-cookie']).toBeUndefined();

    const right = await web('/auth/web/pin-login').send({ pin, tenantSlug: slug });
    expect(right.status).toBe(200);
    expect(right.body).toEqual({ accessToken: expect.any(String) });
    expect(setCookieLine(right)).toMatch(/HttpOnly/i);
  });

  it('CORS: un origen no listado no recibe credenciales; localhost sí (sin CORS_ORIGINS, solo desarrollo)', async () => {
    const local = await request(app.getHttpServer()).options('/auth/web/login').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'x-requested-with,content-type');
    expect(local.headers['access-control-allow-credentials']).toBe('true');
    expect(String(local.headers['access-control-allow-headers']).toLowerCase()).toContain('x-requested-with');

    const remote = await request(app.getHttpServer()).options('/auth/web/login').set('Origin', 'http://sitio-ajeno.example').set('Access-Control-Request-Method', 'POST');
    expect(remote.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
