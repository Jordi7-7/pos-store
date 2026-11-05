import { EntityManager } from 'typeorm';
import { HashService } from '../../auth/services/hash.service';
import { User } from '../domain/entities/user.entity';
import { isPinInUse } from './pin-uniqueness';

describe('isPinInUse', () => {
  const getMany = jest.fn();
  const compare = jest.fn<Promise<boolean>, [string, string]>();
  const qb = { addSelect: () => qb, where: () => qb, andWhere: () => qb, getMany };
  const entityManager = { getRepository: () => ({ createQueryBuilder: () => qb }) } as unknown as EntityManager;
  const hashService = { compare } as unknown as HashService;

  beforeEach(() => jest.resetAllMocks());

  it('devuelve true si el PIN coincide con el de otro usuario', async () => {
    getMany.mockResolvedValue([{ id: 'u2', pin: 'h2' } as User]);
    compare.mockResolvedValue(true);

    await expect(isPinInUse(entityManager, hashService, 't1', '123456', 'u1')).resolves.toBe(true);
  });

  it('ignora al propio usuario (puede conservar su PIN)', async () => {
    getMany.mockResolvedValue([{ id: 'u1', pin: 'h1' } as User]);
    compare.mockResolvedValue(true);

    await expect(isPinInUse(entityManager, hashService, 't1', '123456', 'u1')).resolves.toBe(false);
    expect(compare).not.toHaveBeenCalled();
  });

  it('devuelve false si nadie lo usa', async () => {
    getMany.mockResolvedValue([{ id: 'u2', pin: 'h2' } as User]);
    compare.mockResolvedValue(false);

    await expect(isPinInUse(entityManager, hashService, 't1', '123456')).resolves.toBe(false);
  });
});
