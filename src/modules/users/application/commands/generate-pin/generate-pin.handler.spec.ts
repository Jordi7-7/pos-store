import { EntityManager } from 'typeorm';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { HashService } from '../../../../auth/services/hash.service';
import { User } from '../../../domain/entities/user.entity';
import { GeneratePinCommand } from './generate-pin.command';
import { GeneratePinHandler } from './generate-pin.handler';

// La regla de no-escalada se prueba aparte (privilege-escalation.spec y tests de integración): aquí actúa el propietario
jest.mock('../../../../../common/security/privilege-escalation', () => ({
  ...jest.requireActual('../../../../../common/security/privilege-escalation'),
  loadActorPermissions: () => Promise.resolve(['*']),
  loadEffectivePermissionsOf: () => Promise.resolve([]),
}));

describe('GeneratePinHandler', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const getMany = jest.fn();
  const hash = jest.fn<Promise<string>, [string]>();
  const compare = jest.fn<Promise<boolean>, [string, string]>();

  const qb = { addSelect: () => qb, where: () => qb, andWhere: () => qb, getMany };
  const entityManager = {
    getRepository: () => ({ findOne, save, createQueryBuilder: () => qb }),
  } as unknown as EntityManager;
  const hashService = { hash, compare } as unknown as HashService;
  const handler = new GeneratePinHandler(entityManager, hashService);

  beforeEach(() => {
    jest.resetAllMocks();
    hash.mockResolvedValue('hashed-pin');
    getMany.mockResolvedValue([]);
  });

  it('genera un PIN numérico de 6 dígitos, guarda solo el hash y lo devuelve una vez', async () => {
    findOne.mockResolvedValue({ id: 'u1', name: 'Ana', tenantId: 't1' } as User);

    const result = await handler.execute(new GeneratePinCommand('t1', 'u1', 'actor'));

    expect(result.userId).toBe('u1');
    expect(result.pin).toMatch(/^\d{6}$/);
    expect(hash).toHaveBeenCalledWith(result.pin);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ pin: 'hashed-pin' }));
  });

  it('consulta el usuario filtrando por tenantId', async () => {
    findOne.mockResolvedValue(null);

    await expect(handler.execute(new GeneratePinCommand('t1', 'u1', 'actor'))).rejects.toMatchObject({ code: ErrorCode.UserNotFound });
    expect(findOne).toHaveBeenCalledWith({ where: { id: 'u1', tenantId: 't1' } });
    expect(save).not.toHaveBeenCalled();
  });

  it('reintenta si el PIN candidato ya lo usa otro usuario', async () => {
    findOne.mockResolvedValue({ id: 'u1', name: 'Ana', tenantId: 't1' } as User);
    getMany.mockResolvedValue([{ id: 'u2', pin: 'hash-de-otro' } as User]);
    // Las dos primeras comparaciones "colisionan"; la tercera ya no.
    compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);

    const result = await handler.execute(new GeneratePinCommand('t1', 'u1', 'actor'));

    expect(result.pin).toMatch(/^\d{6}$/);
    expect(compare).toHaveBeenCalledTimes(3);
  });

  it('falla con PIN_ALREADY_IN_USE si no encuentra un PIN libre', async () => {
    findOne.mockResolvedValue({ id: 'u1', name: 'Ana', tenantId: 't1' } as User);
    getMany.mockResolvedValue([{ id: 'u2', pin: 'hash-de-otro' } as User]);
    compare.mockResolvedValue(true);

    const error: unknown = await handler.execute(new GeneratePinCommand('t1', 'u1', 'actor')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(ErrorCode.PinAlreadyInUse);
    expect(save).not.toHaveBeenCalled();
  });
});
