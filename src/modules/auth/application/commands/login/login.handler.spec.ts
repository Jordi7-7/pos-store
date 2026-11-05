import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { RedisService } from '../../../../../common/redis/redis.service';
import { User } from '../../../../users/domain/entities/user.entity';
import { AuthTokenService } from '../../../services/auth-token.service';
import { HashService } from '../../../services/hash.service';
import { LoginAttemptsService } from '../../../services/login-attempts.service';
import { LoginCommand } from './login.command';
import { LoginHandler } from './login.handler';

describe('LoginHandler', () => {
  const hashService = new HashService();
  // Sin Redis: el servicio de intentos usa su contador en memoria, igual que en una caída real
  const noRedis = { get: () => Promise.resolve(null), incr: () => Promise.resolve(null), del: () => Promise.resolve() } as unknown as RedisService;

  let storedHash: string;
  const issueSession = jest.fn();
  const findTenant = jest.fn();
  const getOne = jest.fn();
  const qb = { leftJoinAndSelect: () => qb, addSelect: () => qb, where: () => qb, andWhere: () => qb, getOne };
  const entityManager = { findOne: findTenant, getRepository: () => ({ createQueryBuilder: () => qb }) } as unknown as EntityManager;

  let handler: LoginHandler;
  let placeholder: jest.SpyInstance;

  const activeUser = (): User => ({ id: 'u1', tenantId: 't1', name: 'Ana', isActive: true, isOwner: false, password: storedHash }) as unknown as User;
  const login = (password = 'clave-correcta', identifier = 'ana', ip = '1.1.1.1', slug: string | undefined = 'tienda') =>
    handler.execute(new LoginCommand(identifier, password, slug, ip));
  const failureOf = async (promise: Promise<unknown>): Promise<{ code?: string; message?: string }> => {
    try {
      await promise;
    } catch (error) {
      return error as { code?: string; message?: string };
    }
    throw new Error('se esperaba que el login fallara');
  };

  beforeAll(async () => {
    storedHash = await hashService.hash('clave-correcta');
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // Estado limpio de contadores en cada prueba
    handler = new LoginHandler(entityManager, hashService, { issueSession } as unknown as AuthTokenService, new LoginAttemptsService(noRedis));
    placeholder = jest.spyOn(hashService, 'compareAgainstPlaceholder');
    findTenant.mockResolvedValue({ id: 't1', slug: 'tienda' });
    getOne.mockResolvedValue(activeUser());
    issueSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
  });

  afterEach(() => placeholder.mockRestore());

  it('con la contraseña correcta inicia sesión', async () => {
    await expect(login()).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(issueSession).toHaveBeenCalledTimes(1);
  });

  it('una contraseña incorrecta responde INVALID_CREDENTIALS y no emite sesión', async () => {
    await expect(login('otra')).rejects.toMatchObject({ code: ErrorCode.InvalidCredentials });
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('tras 5 fallos desde la misma IP, ni la contraseña correcta entra: TOO_MANY_ATTEMPTS', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(login('mal')).rejects.toMatchObject({ code: ErrorCode.InvalidCredentials });
    }

    await expect(login('clave-correcta')).rejects.toMatchObject({ code: ErrorCode.TooManyAttempts });
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('un bloqueo corta antes de consultar el usuario o calcular ningún hash', async () => {
    for (let attempt = 0; attempt < 5; attempt++) await login('mal').catch(() => undefined);
    getOne.mockClear();

    await login('clave-correcta').catch(() => undefined);

    expect(getOne).not.toHaveBeenCalled();
  });

  it('otra IP no hereda el bloqueo por IP, pero el contador de la cuenta sigue contando', async () => {
    for (let attempt = 0; attempt < 5; attempt++) await login('mal', 'ana', '1.1.1.1').catch(() => undefined);

    await expect(login('clave-correcta', 'ana', '2.2.2.2')).resolves.toBeDefined();
  });

  it('un ataque repartido entre muchas IP contra la misma cuenta acaba bloqueado (20 fallos)', async () => {
    for (let n = 0; n < 20; n++) await login('mal', 'ana', `10.0.0.${n}`).catch(() => undefined);

    await expect(login('clave-correcta', 'ana', '10.0.1.1')).rejects.toMatchObject({ code: ErrorCode.TooManyAttempts });
  });

  it('el éxito reinicia el contador de esa cuenta desde esa IP', async () => {
    for (let attempt = 0; attempt < 4; attempt++) await login('mal').catch(() => undefined);
    await expect(login()).resolves.toBeDefined();

    for (let attempt = 0; attempt < 4; attempt++) await login('mal').catch(() => undefined);
    await expect(login()).resolves.toBeDefined();
  });

  describe('usuario inexistente', () => {
    beforeEach(() => getOne.mockResolvedValue(null));

    it('responde exactamente lo mismo que una contraseña incorrecta', async () => {
      const missing = await failureOf(login('x', 'fantasma'));
      getOne.mockResolvedValue(activeUser());
      const wrong = await failureOf(login('mal'));

      expect(missing.code).toBe(wrong.code);
      expect(missing.message).toBe(wrong.message);
    });

    it('igual calcula un hash, para que el tiempo no delate qué cuentas existen', async () => {
      await login('x', 'fantasma').catch(() => undefined);

      expect(placeholder).toHaveBeenCalledWith('x');
    });
  });

  describe('usuario deshabilitado', () => {
    it('con la contraseña correcta se le informa que está deshabilitado', async () => {
      getOne.mockResolvedValue({ ...activeUser(), isActive: false });
      await expect(login()).rejects.toMatchObject({ code: ErrorCode.UserDisabled });
    });

    it('con una contraseña incorrecta no se revela que la cuenta existe ni que está deshabilitada', async () => {
      getOne.mockResolvedValue({ ...activeUser(), isActive: false });
      await expect(login('mal')).rejects.toMatchObject({ code: ErrorCode.InvalidCredentials });
    });
  });

  describe('tienda', () => {
    it('sin identificador de tienda responde TENANT_SLUG_REQUIRED', async () => {
      await expect(login('clave-correcta', 'ana', '1.1.1.1', '  ')).rejects.toMatchObject({ code: ErrorCode.TenantSlugRequired });
    });

    it('una tienda inexistente cuenta contra el límite de la IP: no se pueden sondear tiendas sin freno', async () => {
      findTenant.mockResolvedValue(null);
      for (let attempt = 0; attempt < 100; attempt++) {
        await expect(login('x', 'ana', '3.3.3.3', 'no-existe')).rejects.toMatchObject({ code: ErrorCode.InvalidCredentials });
      }

      await expect(login('x', 'ana', '3.3.3.3', 'no-existe')).rejects.toMatchObject({ code: ErrorCode.TooManyAttempts });
      expect(findTenant).toHaveBeenCalledTimes(100);
    });
  });
});
