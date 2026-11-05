import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { HashService } from '../../../../auth/services/hash.service';
import { User } from '../../../domain/entities/user.entity';
import { GeneratePinCommand } from './generate-pin.command';
import { GeneratePinHandler } from './generate-pin.handler';

describe('GeneratePinHandler', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const hash = jest.fn<Promise<string>, [string]>();

  const entityManager = {
    getRepository: () => ({ findOne, save }),
  } as unknown as EntityManager;
  const hashService = { hash } as unknown as HashService;
  const handler = new GeneratePinHandler(entityManager, hashService);

  beforeEach(() => {
    jest.resetAllMocks();
    hash.mockResolvedValue('hashed-pin');
  });

  it('genera un PIN numérico de 6 dígitos, guarda solo el hash y lo devuelve una vez', async () => {
    const user = { id: 'u1', name: 'Ana', tenantId: 't1' } as User;
    findOne.mockResolvedValue(user);

    const result = await handler.execute(new GeneratePinCommand('t1', 'u1'));

    expect(result.userId).toBe('u1');
    expect(result.pin).toMatch(/^\d{6}$/);
    expect(hash).toHaveBeenCalledWith(result.pin);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ pin: 'hashed-pin' }),
    );
  });

  it('consulta el usuario filtrando por tenantId', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      handler.execute(new GeneratePinCommand('t1', 'u1')),
    ).rejects.toThrow(NotFoundException);
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'u1', tenantId: 't1' },
    });
    expect(save).not.toHaveBeenCalled();
  });
});
