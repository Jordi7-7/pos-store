import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { AppException } from '../../../../../common/errors/app.exception';
import { User } from '../../../../users/domain/entities/user.entity';
import { AuthTokenService } from '../../../services/auth-token.service';
import { RefreshTokenCommand } from './refresh-token.command';
import { RefreshTokenHandler } from './refresh-token.handler';

describe('RefreshTokenHandler', () => {
  const findOne = jest.fn();
  const verifyRefreshToken = jest.fn();
  const assertIsCurrentRefreshToken = jest.fn();
  const revokeSession = jest.fn();
  const issueSession = jest.fn();
  const sessionExpired = () => new AppException(ErrorCode.SessionExpired, 'expirada', 401);
  const tokens = { verifyRefreshToken, assertIsCurrentRefreshToken, revokeSession, issueSession, sessionExpired } as unknown as AuthTokenService;
  const handler = new RefreshTokenHandler({ findOne } as unknown as EntityManager, tokens);
  const run = () => handler.execute(new RefreshTokenCommand('old-refresh'));

  beforeEach(() => {
    jest.resetAllMocks();
    verifyRefreshToken.mockResolvedValue('u1');
    assertIsCurrentRefreshToken.mockResolvedValue(undefined);
    issueSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
  });

  it('rota los tokens para un usuario activo', async () => {
    const user = { id: 'u1', tenantId: 't1', isActive: true, isOwner: false } as User;
    findOne.mockResolvedValue(user);

    await expect(run()).resolves.toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(issueSession).toHaveBeenCalledWith(user);
  });

  it('rechaza y revoca la sesión de un usuario desactivado', async () => {
    findOne.mockResolvedValue({ id: 'u1', tenantId: 't1', isActive: false } as User);

    await expect(run()).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    expect(revokeSession).toHaveBeenCalledWith('u1');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rechaza y revoca la sesión de un usuario que ya no existe', async () => {
    findOne.mockResolvedValue(null);

    await expect(run()).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    expect(revokeSession).toHaveBeenCalledWith('u1');
  });

  it('un refresh token distinto al almacenado (reutilización) se propaga sin tocar la base de datos', async () => {
    assertIsCurrentRefreshToken.mockRejectedValue(sessionExpired());

    await expect(run()).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('un token inválido o vencido responde SESSION_EXPIRED', async () => {
    verifyRefreshToken.mockRejectedValue(sessionExpired());

    await expect(run()).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    expect(assertIsCurrentRefreshToken).not.toHaveBeenCalled();
  });

  it('un fallo de la base de datos NO se disfraza de sesión expirada (no cierra la sesión del usuario)', async () => {
    findOne.mockRejectedValue(new Error('connection reset'));

    const error: unknown = await run().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
