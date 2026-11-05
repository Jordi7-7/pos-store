import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { AssignUsersToCashRegisterCommand } from './assign-users-to-cash-register.command';
import { AssignUsersToCashRegisterHandler } from './assign-users-to-cash-register.handler';

describe('AssignUsersToCashRegisterHandler', () => {
  const query = jest.fn();
  const findOne = jest.fn();
  const transactionalManager = { query, getRepository: () => ({ findOne }) } as unknown as EntityManager;
  const handler = new AssignUsersToCashRegisterHandler({
    transaction: (cb: (m: EntityManager) => Promise<unknown>) => cb(transactionalManager),
  } as unknown as EntityManager);

  beforeEach(() => {
    query.mockReset();
    findOne.mockReset().mockResolvedValue({ id: 'r1', tenantId: 't1' });
  });

  it('rechaza usuarios de otro tenant sin tocar las asignaciones existentes', async () => {
    query.mockResolvedValueOnce([]); // la verificación de pertenencia no encuentra al usuario

    await expect(handler.execute(new AssignUsersToCashRegisterCommand('t1', 'r1', ['u-ajeno']))).rejects.toMatchObject({
      code: ErrorCode.InvalidReference,
    });
    expect(query).toHaveBeenCalledTimes(1); // no llegó al DELETE ni al INSERT
  });

  it('asigna cuando todos los usuarios son del tenant', async () => {
    query.mockResolvedValueOnce([{ id: 'u1' }]).mockResolvedValue([]);

    await expect(handler.execute(new AssignUsersToCashRegisterCommand('t1', 'r1', ['u1']))).resolves.toMatchObject({
      success: true,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "user_cash_registers"'), ['u1', 'r1']);
  });
});
