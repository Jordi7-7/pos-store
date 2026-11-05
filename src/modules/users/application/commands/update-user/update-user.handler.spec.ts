import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { APP_PERMISSIONS } from '../../../../../common/enums/permissions.enum';
import { HashService } from '../../../../auth/services/hash.service';
import { User } from '../../../domain/entities/user.entity';
import { UpdateUserCommand } from './update-user.command';
import { UpdateUserDto } from './update-user.dto';
import { UpdateUserHandler } from './update-user.handler';

describe('UpdateUserHandler', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const query = jest.fn();

  const entityManager = {
    getRepository: () => ({ findOne, save }),
    query,
  } as unknown as EntityManager;
  const hashService = { hash: jest.fn() } as unknown as HashService;
  const redisService = {} as unknown as RedisService;
  const handler = new UpdateUserHandler(
    entityManager,
    hashService,
    redisService,
  );

  const run = (userId: string, dto: UpdateUserDto, currentUserId?: string) =>
    handler.execute(new UpdateUserCommand('t1', userId, dto, currentUserId));

  beforeEach(() => {
    jest.resetAllMocks();
    save.mockImplementation((u: User) => Promise.resolve(u));
  });

  it('impide que otro usuario modifique la cuenta del propietario', async () => {
    findOne.mockResolvedValue({
      id: 'owner',
      isOwner: true,
      tenantId: 't1',
    });

    await expect(run('owner', { name: 'Hacked' }, 'manager')).rejects.toThrow(
      ForbiddenException,
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('el propietario sí puede editar su propia cuenta', async () => {
    findOne.mockResolvedValue({
      id: 'owner',
      isOwner: true,
      tenantId: 't1',
      name: 'Old',
    });

    const result = await run('owner', { name: 'New' }, 'owner');

    expect(result.name).toBe('New');
  });

  it("rechaza customPermissions con el comodín '*'", async () => {
    findOne.mockResolvedValue({
      id: 'u2',
      isOwner: false,
      tenantId: 't1',
    });

    await expect(
      run('u2', { customPermissions: ['*'] }, 'manager'),
    ).rejects.toThrow(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('guarda customPermissions válidos', async () => {
    findOne.mockResolvedValue({
      id: 'u2',
      isOwner: false,
      tenantId: 't1',
    });

    const result = await run(
      'u2',
      { customPermissions: [APP_PERMISSIONS.VIEW_POS] },
      'manager',
    );

    expect(result.customPermissions).toEqual([APP_PERMISSIONS.VIEW_POS]);
  });

  it('no permite que un usuario se desactive a sí mismo', async () => {
    findOne.mockResolvedValue({
      id: 'u2',
      isOwner: false,
      tenantId: 't1',
    });

    await expect(run('u2', { isActive: false }, 'u2')).rejects.toThrow(
      BadRequestException,
    );
  });
});
