import { EntityManager } from 'typeorm';
import { assertBranchesExist, findBranchOrFail } from './branch-lookup';

describe('búsqueda de sucursales de la tienda', () => {
  const find = jest.fn();
  const findOne = jest.fn();
  const manager = { getRepository: () => ({ find, findOne }) } as unknown as EntityManager;

  beforeEach(() => jest.resetAllMocks());

  it('devuelve la sucursal de la tienda', async () => {
    findOne.mockResolvedValue({ id: 'b1' });
    await expect(findBranchOrFail(manager, 't1', 'b1')).resolves.toEqual({ id: 'b1' });
    expect(findOne).toHaveBeenCalledWith({ where: { id: 'b1', tenantId: 't1' } });
  });

  it('una sucursal que no es de la tienda responde 404 BRANCH_NOT_FOUND con su id', async () => {
    findOne.mockResolvedValue(null);
    await expect(findBranchOrFail(manager, 't1', 'ajena')).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND', status: 404, details: { branchId: 'ajena' } });
  });

  it('varias sucursales se comprueban con una sola consulta y se nombra la primera que falta', async () => {
    find.mockResolvedValue([{ id: 'b1' }, { id: 'b3' }]);
    await expect(assertBranchesExist(manager, 't1', ['b1', 'b2', 'b3', 'b2'])).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND', details: { branchId: 'b2' } });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('sin sucursales que comprobar no consulta nada, y si todas existen no lanza', async () => {
    await expect(assertBranchesExist(manager, 't1', [])).resolves.toBeUndefined();
    expect(find).not.toHaveBeenCalled();
    find.mockResolvedValue([{ id: 'b1' }]);
    await expect(assertBranchesExist(manager, 't1', ['b1', 'b1'])).resolves.toBeUndefined();
  });
});
