import { ErrorCode } from '../../../../../common/errors/error-codes';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { User } from '../../../../users/domain/entities/user.entity';
import { RefreshTokenCommand } from './refresh-token.command';
import { RefreshTokenHandler } from './refresh-token.handler';

describe('RefreshTokenHandler', () => {
  const findOne = jest.fn();
  const entityManager = { findOne } as unknown as EntityManager;
  const verifyAsync = jest.fn();
  const jwtService = { verifyAsync, sign: jest.fn().mockReturnValue('new-token') } as unknown as JwtService;
  const configService = { get: jest.fn((_k: string, d?: string) => d ?? 'secret') } as unknown as ConfigService;
  const get = jest.fn();
  const set = jest.fn();
  const del = jest.fn();
  const redisService = { get, set, del } as unknown as RedisService;
  const handler = new RefreshTokenHandler(entityManager, jwtService, configService, redisService);

  beforeEach(() => {
    jest.clearAllMocks();
    verifyAsync.mockResolvedValue({ sub: 'u1' });
    get.mockResolvedValue('old-refresh');
  });

  it('rota los tokens para un usuario activo', async () => {
    findOne.mockResolvedValue({ id: 'u1', tenantId: 't1', isActive: true, isOwner: false } as User);

    const result = await handler.execute(new RefreshTokenCommand('old-refresh'));

    expect(result).toEqual({ accessToken: 'new-token', refreshToken: 'new-token' });
    expect(set).toHaveBeenCalled();
  });

  it('rechaza y revoca la sesión de un usuario desactivado', async () => {
    findOne.mockResolvedValue({ id: 'u1', tenantId: 't1', isActive: false } as User);

    await expect(handler.execute(new RefreshTokenCommand('old-refresh'))).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    expect(del).toHaveBeenCalledWith('refresh_token:u1');
    expect(set).not.toHaveBeenCalled();
  });

  it('rechaza un refresh token distinto al almacenado (reutilización)', async () => {
    get.mockResolvedValue('otro-token');

    await expect(handler.execute(new RefreshTokenCommand('old-refresh'))).rejects.toMatchObject({ code: ErrorCode.SessionExpired });
    expect(del).toHaveBeenCalledWith('refresh_token:u1');
  });
});
