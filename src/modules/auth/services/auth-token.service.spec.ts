import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../../common/errors/error-codes';
import { RedisService } from '../../../common/redis/redis.service';
import { AuthTokenService, TokenSubject } from './auth-token.service';

describe('AuthTokenService', () => {
  const secrets: Record<string, string> = { JWT_SECRET: 'access-secret', REFRESH_TOKEN_SECRET: 'refresh-secret' };
  const config = {
    getOrThrow: (key: string) => secrets[key],
    get: (_key: string, fallback?: string) => fallback,
  } as unknown as ConfigService;
  const jwt = new JwtService();
  const store = new Map<string, { value: string; ttl?: number }>();
  const redis = {
    get: (key: string) => Promise.resolve(store.get(key)?.value ?? null),
    set: (key: string, value: string, ttl?: number) => {
      store.set(key, { value, ttl });
      return Promise.resolve();
    },
    del: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  } as unknown as RedisService;
  const service = new AuthTokenService(jwt, config, redis);

  const cashier: TokenSubject = {
    id: 'u1',
    tenantId: 't1',
    name: 'Ana',
    username: 'ana',
    email: null,
    isOwner: false,
    roleId: 'r1',
    roleEntity: { name: 'Cajero', permissions: ['pos.sell'] },
    customPermissions: ['extra'],
  };

  beforeEach(() => store.clear());

  describe('issueSession', () => {
    it('el token de acceso lleva identidad, tenant y los permisos efectivos', async () => {
      const { accessToken } = await service.issueSession(cashier);

      const payload = jwt.verify<Record<string, unknown>>(accessToken, { secret: secrets.JWT_SECRET });
      expect(payload).toMatchObject({
        sub: 'u1',
        tenantId: 't1',
        isOwner: false,
        role: 'Cajero',
        roleName: 'Cajero',
        permissions: ['pos.sell', 'extra'],
        name: 'Ana',
      });
      expect(payload).not.toHaveProperty('password');
    });

    it("el propietario recibe '*' y el rol Propietario", async () => {
      const { accessToken } = await service.issueSession({ ...cashier, isOwner: true, roleEntity: null });

      expect(jwt.verify<Record<string, unknown>>(accessToken, { secret: secrets.JWT_SECRET })).toMatchObject({
        role: 'OWNER',
        roleName: 'Propietario',
        permissions: ['*'],
      });
    });

    it('el refresh token solo lleva el id y queda guardado como el único vigente, con TTL igual a su vida', async () => {
      const { refreshToken } = await service.issueSession(cashier);

      expect(jwt.verify<{ sub: string }>(refreshToken, { secret: secrets.REFRESH_TOKEN_SECRET }).sub).toBe('u1');
      const stored = store.get('refresh_token:u1');
      expect(stored?.value).toBe(refreshToken);
      expect(stored?.ttl).toBeGreaterThan(7 * 24 * 3600 - 5);
      expect(stored?.ttl).toBeLessThanOrEqual(7 * 24 * 3600);
    });

    it('una nueva sesión reemplaza al refresh token anterior, aunque se emita en el mismo segundo', async () => {
      const first = await service.issueSession(cashier);
      const second = await service.issueSession(cashier);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      await expect(service.assertIsCurrentRefreshToken('u1', first.refreshToken)).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    });
  });

  describe('verifyRefreshToken', () => {
    it('devuelve el id del usuario de un token válido', async () => {
      const { refreshToken } = await service.issueSession(cashier);
      await expect(service.verifyRefreshToken(refreshToken)).resolves.toBe('u1');
    });

    it('rechaza un token de acceso usado como refresh (otra clave) y basura', async () => {
      const { accessToken } = await service.issueSession(cashier);
      await expect(service.verifyRefreshToken(accessToken)).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
      await expect(service.verifyRefreshToken('basura')).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    });
  });

  describe('assertIsCurrentRefreshToken', () => {
    it('acepta el último token emitido', async () => {
      const { refreshToken } = await service.issueSession(cashier);
      await expect(service.assertIsCurrentRefreshToken('u1', refreshToken)).resolves.toBeUndefined();
    });

    it('un token distinto revoca la sesión por completo (posible reutilización)', async () => {
      await service.issueSession(cashier);

      await expect(service.assertIsCurrentRefreshToken('u1', 'otro')).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
      expect(store.has('refresh_token:u1')).toBe(false);
    });

    it('sin sesión guardada responde SESSION_EXPIRED', async () => {
      await expect(service.assertIsCurrentRefreshToken('u9', 'x')).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    });
  });

  it('revokeSession elimina el refresh token', async () => {
    await service.issueSession(cashier);
    await service.revokeSession('u1');
    expect(store.has('refresh_token:u1')).toBe(false);
  });
});
