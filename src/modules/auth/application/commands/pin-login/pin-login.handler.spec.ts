import { EntityManager } from 'typeorm';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { AuthTokenService } from '../../../services/auth-token.service';
import { HashService } from '../../../services/hash.service';
import { LoginAttemptsService } from '../../../services/login-attempts.service';
import { User } from '../../../../users/domain/entities/user.entity';
import { PinLoginCommand } from './pin-login.command';
import { PinLoginHandler } from './pin-login.handler';

describe('PinLoginHandler', () => {
  const findOneTenant = jest.fn();
  const getMany = jest.fn();
  const qb = {
    leftJoinAndSelect: () => qb,
    addSelect: () => qb,
    where: () => qb,
    andWhere: () => qb,
    getMany,
  };
  const entityManager = {
    findOne: findOneTenant,
    getRepository: () => ({ createQueryBuilder: () => qb }),
  } as unknown as EntityManager;

  const compare = jest.fn<Promise<boolean>, [string, string]>();
  const hashService = { compare } as unknown as HashService;
  const issueSession = jest.fn().mockResolvedValue({ accessToken: 'signed', refreshToken: 'signed' });
  const tokens = { issueSession } as unknown as AuthTokenService;

  const isLocked = jest.fn<Promise<boolean>, []>();
  const registerFailure = jest.fn();
  const reset = jest.fn();
  const loginAttempts = { isLocked, registerFailure, reset } as unknown as LoginAttemptsService;

  const handler = new PinLoginHandler(entityManager, hashService, tokens, loginAttempts);
  const run = (pin = '123456', slug = 'tienda', ip = '1.1.1.1') => handler.execute(new PinLoginCommand(pin, slug, ip));
  const cashier = { id: 'u1', tenantId: 't1', name: 'Ana', pin: 'hash', isOwner: false, roleEntity: null } as unknown as User;

  const expectAppError = async (promise: Promise<unknown>, code: ErrorCode, status: number): Promise<void> => {
    const error: unknown = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    expect((error as AppException).getStatus()).toBe(status);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    isLocked.mockResolvedValue(false);
    findOneTenant.mockResolvedValue({ id: 't1', slug: 'tienda' });
    getMany.mockResolvedValue([cashier]);
    compare.mockResolvedValue(true);
  });

  it('inicia sesión con un PIN correcto y limpia el contador de fallos de esa IP', async () => {
    const result = await run();

    expect(result).toEqual({ accessToken: 'signed', refreshToken: 'signed' });
    expect(issueSession).toHaveBeenCalledWith(cashier);
    expect(reset).toHaveBeenCalledWith('pin_attempts:t1:1.1.1.1');
  });

  it('PIN incorrecto: responde INVALID_PIN 401 y registra el fallo por IP y por tenant', async () => {
    compare.mockResolvedValue(false);

    await expectAppError(run(), ErrorCode.InvalidPin, 401);
    expect(registerFailure).toHaveBeenCalledTimes(2);
  });

  it('tienda inexistente y PIN incorrecto dan la MISMA respuesta (no revela qué falló)', async () => {
    findOneTenant.mockResolvedValue(null);
    const missingTenant: unknown = await run().catch((e: unknown) => e);

    findOneTenant.mockResolvedValue({ id: 't1', slug: 'tienda' });
    compare.mockResolvedValue(false);
    const wrongPin: unknown = await run().catch((e: unknown) => e);

    expect((missingTenant as AppException).message).toBe((wrongPin as AppException).message);
    expect((missingTenant as AppException).code).toBe((wrongPin as AppException).code);
  });

  it('tenant sin ningún PIN configurado responde igual que un PIN incorrecto', async () => {
    getMany.mockResolvedValue([]);

    await expectAppError(run(), ErrorCode.InvalidPin, 401);
  });

  it('bloqueado: responde TOO_MANY_ATTEMPTS 429 sin consultar usuarios ni comparar hashes', async () => {
    isLocked.mockResolvedValue(true);

    await expectAppError(run(), ErrorCode.TooManyAttempts, 429);
    expect(getMany).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
  });
});
