import { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { assertUserAssignedToCashRegister } from './cash-register-access';

describe('assertUserAssignedToCashRegister', () => {
  const query = jest.fn();
  const manager = { query } as unknown as EntityManager;
  const run = (userId: string | null = 'u1', cashRegisterId: string | null = 'r1') =>
    assertUserAssignedToCashRegister(manager, { tenantId: 't1', userId, cashRegisterId, actionDescription: 'vender' });

  beforeEach(() => query.mockReset());

  it('permite a un cajero asignado a la caja, aunque no haya abierto él la sesión', async () => {
    query.mockResolvedValue([{ is_owner: false, assigned: true }]);
    await expect(run()).resolves.toBeUndefined();
  });

  it('rechaza a un cajero NO asignado a la caja', async () => {
    query.mockResolvedValue([{ is_owner: false, assigned: false }]);
    await expect(run()).rejects.toMatchObject({ code: ErrorCode.CashRegisterNotAssigned });
  });

  it('el propietario puede operar en cualquier caja', async () => {
    query.mockResolvedValue([{ is_owner: true, assigned: false }]);
    await expect(run()).resolves.toBeUndefined();
  });

  it('rechaza usuarios inexistentes, inactivos o de otro tenant (la consulta no devuelve fila)', async () => {
    query.mockResolvedValue([]);
    await expect(run()).rejects.toMatchObject({ code: ErrorCode.CashRegisterNotAssigned });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('"tenant_id" = $2'), ['u1', 't1', 'r1']);
  });

  it('rechaza si no hay usuario', async () => {
    await expect(run(null)).rejects.toMatchObject({ code: ErrorCode.CashRegisterNotAssigned });
    expect(query).not.toHaveBeenCalled();
  });

  it('no restringe sesiones antiguas sin caja asociada', async () => {
    await expect(run('u1', null)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
