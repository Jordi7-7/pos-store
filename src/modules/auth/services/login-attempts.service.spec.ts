import { RedisService } from '../../../common/redis/redis.service';
import { AttemptPolicy, LoginAttemptsService } from './login-attempts.service';

const policy: AttemptPolicy = { key: 'k', maxAttempts: 3, windowSeconds: 60 };

describe('LoginAttemptsService', () => {
  describe('con Redis disponible', () => {
    const store = new Map<string, number>();
    const redis = {
      get: jest.fn((key: string) => Promise.resolve(store.has(key) ? String(store.get(key)) : null)),
      incr: jest.fn((key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return Promise.resolve(next);
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve();
      }),
    } as unknown as RedisService;
    const service = new LoginAttemptsService(redis);

    beforeEach(() => store.clear());

    it('bloquea al alcanzar el máximo de fallos', async () => {
      expect(await service.isLocked(policy)).toBe(false);
      await service.registerFailure(policy);
      await service.registerFailure(policy);
      expect(await service.isLocked(policy)).toBe(false);
      await service.registerFailure(policy);
      expect(await service.isLocked(policy)).toBe(true);
    });

    it('reset desbloquea', async () => {
      for (let i = 0; i < 3; i++) await service.registerFailure(policy);
      await service.reset(policy.key);
      expect(await service.isLocked(policy)).toBe(false);
    });
  });

  describe('con Redis caído (respaldo en memoria)', () => {
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisService;

    it('sigue bloqueando usando memoria del proceso', async () => {
      const service = new LoginAttemptsService(redis);
      for (let i = 0; i < 3; i++) await service.registerFailure(policy);
      expect(await service.isLocked(policy)).toBe(true);
    });

    it('el bloqueo expira al terminar la ventana', async () => {
      const service = new LoginAttemptsService(redis);
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(1_000);
      for (let i = 0; i < 3; i++) await service.registerFailure(policy);
      expect(await service.isLocked(policy)).toBe(true);

      now.mockReturnValue(1_000 + 61_000);
      expect(await service.isLocked(policy)).toBe(false);
      now.mockRestore();
    });
  });
});
