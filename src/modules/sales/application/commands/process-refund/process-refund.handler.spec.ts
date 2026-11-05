import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DomainError } from '../../../../../common/domain/domain.error';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { RedisService } from '../../../../../common/redis/redis.service';
import * as branchAccess from '../../../../../common/security/branch-access.helper';
import * as registerAccess from '../shared/cash-register-access';
import { ProcessRefundCommand, RefundItemInput } from './process-refund.command';
import { ProcessRefundHandler } from './process-refund.handler';

describe('ProcessRefundHandler (validaciones previas a persistir)', () => {
  const transaction = jest.fn();
  const handler = new ProcessRefundHandler({ transaction } as unknown as EntityManager, {} as unknown as RedisService);
  const build = (items: RefundItemInput[]) => new ProcessRefundCommand('t1', 'u1', 'b1', 'sale1', 's1', 'defecto', items);

  beforeEach(() => {
    jest.restoreAllMocks();
    transaction.mockReset();
  });

  it.each([[[]], [[{ variantId: 'v1', quantity: 0 }]], [[{ variantId: 'v1', quantity: -2 }]]])(
    'rechaza devoluciones sin productos o con cantidades no positivas (%j) sin abrir transacción',
    async (items) => {
      const error: unknown = await handler.execute(build(items as RefundItemInput[])).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.InvalidRefund);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('exige acceso a la sucursal', async () => {
    transaction.mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) => cb({} as EntityManager));
    jest.spyOn(branchAccess, 'assertUserCanOperateInBranch').mockRejectedValue(new ForbiddenException());

    await expect(handler.execute(build([{ variantId: 'v1', quantity: 1 }]))).rejects.toThrow(ForbiddenException);
  });

  it('un cajero no asignado a la caja de la sesión no puede registrar devoluciones', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ id: 'b1', tenantId: 't1' }) // sucursal
      .mockResolvedValueOnce({ id: 's1', cashRegisterId: 'r1', branch: {} }); // sesión de caja
    const tm = { query: jest.fn().mockResolvedValue([]), getRepository: () => ({ findOne }) } as unknown as EntityManager;
    transaction.mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) => cb(tm));
    jest.spyOn(branchAccess, 'assertUserCanOperateInBranch').mockResolvedValue(undefined);
    const access = jest
      .spyOn(registerAccess, 'assertUserAssignedToCashRegister')
      .mockRejectedValue(new ForbiddenException('Caja no asignada'));

    await expect(handler.execute(build([{ variantId: 'v1', quantity: 1 }]))).rejects.toThrow(ForbiddenException);
    expect(access).toHaveBeenCalledWith(tm, expect.objectContaining({ cashRegisterId: 'r1' }));
  });
});
