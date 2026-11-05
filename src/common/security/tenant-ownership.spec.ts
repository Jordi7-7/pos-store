import { EntityManager } from 'typeorm';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { assertBranchesBelongToTenant, assertUsersBelongToTenant } from './tenant-ownership';

describe('tenant-ownership', () => {
  const query = jest.fn();
  const manager = { query } as unknown as EntityManager;

  beforeEach(() => query.mockReset());

  it('no consulta la base de datos si no hay IDs', async () => {
    await assertBranchesBelongToTenant(manager, 't1', []);
    expect(query).not.toHaveBeenCalled();
  });

  it('acepta cuando todas las sucursales son del tenant (ignorando duplicados)', async () => {
    query.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);

    await expect(assertBranchesBelongToTenant(manager, 't1', ['b1', 'b2', 'b1'])).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('"tenant_id" = $2'), [['b1', 'b2'], 't1']);
  });

  it('rechaza si alguna sucursal es de otro tenant o no existe', async () => {
    query.mockResolvedValue([{ id: 'b1' }]);

    const error: unknown = await assertBranchesBelongToTenant(manager, 't1', ['b1', 'ajena']).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(ErrorCode.InvalidReference);
    expect((error as AppException).getStatus()).toBe(400);
  });

  it('rechaza usuarios de otro tenant', async () => {
    query.mockResolvedValue([]);

    await expect(assertUsersBelongToTenant(manager, 't1', ['u-ajeno'])).rejects.toMatchObject({
      code: ErrorCode.InvalidReference,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('"users"'), expect.anything());
  });
});
