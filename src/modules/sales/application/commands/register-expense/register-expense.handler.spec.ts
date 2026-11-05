import { ErrorCode } from '../../../../../common/errors/error-codes';
import { EntityManager } from 'typeorm';
import { CashSessionStatus } from '../../../domain/enums/cash-session-status.enum';
import { Expense } from '../../../domain/entities/expense.entity';
import { RegisterExpenseCommand } from './register-expense.command';
import { RegisterExpenseHandler } from './register-expense.handler';

describe('RegisterExpenseHandler', () => {
  const findBranch = jest.fn();
  const findSession = jest.fn();
  const saveExpense = jest.fn((e: Expense) => Promise.resolve(e));
  const query = jest.fn();

  const repos = new Map<string, unknown>();
  const transactionalManager = {
    query,
    getRepository: (entity: { name: string }) => repos.get(entity.name),
  } as unknown as EntityManager;
  const entityManager = {
    transaction: (cb: (m: EntityManager) => Promise<unknown>) => cb(transactionalManager),
  } as unknown as EntityManager;
  const handler = new RegisterExpenseHandler(entityManager);

  beforeEach(() => {
    jest.clearAllMocks();
    repos.set('Branch', { findOne: findBranch });
    repos.set('CashSession', { findOne: findSession });
    repos.set('Expense', { save: saveExpense });
    findBranch.mockResolvedValue({ id: 'b1', tenantId: 't1' });
    // acceso a la caja (cajero asignado) y bloqueos de sesión
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('user_cash_registers') ? [{ is_owner: false, assigned: true }] : []),
    );
  });

  const command = (cashSessionId?: string) =>
    new RegisterExpenseCommand('t1', 'b1', 'Insumos', 12.5, 'OTROS', 'u1', cashSessionId);

  it('usa la sesión abierta de la sucursal cuando no se indica ninguna', async () => {
    findSession.mockResolvedValue({ id: 'abierta', cashRegisterId: 'r1' });

    const expense = await handler.execute(command());

    expect(findSession).toHaveBeenCalledWith({ where: { branchId: 'b1', status: CashSessionStatus.OPEN } });
    expect(expense.cashSessionId).toBe('abierta');
  });

  it('si el cliente indica una sesión, la valida contra la sucursal y que esté abierta', async () => {
    findSession.mockResolvedValue({ id: 'solicitada' });

    await handler.execute(command('solicitada'));

    expect(findSession).toHaveBeenCalledWith({
      where: { id: 'solicitada', branchId: 'b1', status: CashSessionStatus.OPEN },
    });
  });

  it('rechaza una sesión inexistente, cerrada o de otra sucursal/tenant (no la acepta a ciegas)', async () => {
    findSession.mockResolvedValue(null);

    await expect(handler.execute(command('de-otro-tenant'))).rejects.toMatchObject({ code: ErrorCode.NoOpenCashSession });
    expect(saveExpense).not.toHaveBeenCalled();
  });

  it('bloquea la sesión (FOR SHARE) antes de guardar el gasto', async () => {
    findSession.mockResolvedValue({ id: 'abierta' });

    await handler.execute(command());

    expect(query).toHaveBeenCalledWith(expect.stringMatching(/FOR SHARE$/), ['abierta']);
  });

  it('rechaza a un cajero no asignado a la caja de la sesión', async () => {
    findSession.mockResolvedValue({ id: 'abierta', cashRegisterId: 'r1' });
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('user_cash_registers') ? [{ is_owner: false, assigned: false }] : []),
    );

    await expect(handler.execute(command())).rejects.toMatchObject({ code: 'CASH_REGISTER_NOT_ASSIGNED' });
    expect(saveExpense).not.toHaveBeenCalled();
  });
});
