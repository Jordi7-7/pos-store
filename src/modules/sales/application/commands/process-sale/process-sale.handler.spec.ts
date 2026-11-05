import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DomainError } from '../../../../../common/domain/domain.error';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { RedisService } from '../../../../../common/redis/redis.service';
import * as branchAccess from '../../../../../common/security/branch-access.helper';
import { PaymentMethod } from '../../../domain/entities/sale-payment.entity';
import { ProcessSaleCommand, SaleItemInput } from './process-sale.command';
import { ProcessSaleHandler } from './process-sale.handler';
import * as registerAccess from '../shared/cash-register-access';

describe('ProcessSaleHandler (validaciones previas a persistir)', () => {
  const transaction = jest.fn();
  const entityManager = { transaction } as unknown as EntityManager;
  const handler = new ProcessSaleHandler(entityManager, {} as unknown as RedisService);

  const build = (items: SaleItemInput[], discountAmount?: number, userId: string | null = 'u1') =>
    new ProcessSaleCommand(
      't1',
      userId,
      'b1',
      's1',
      undefined,
      items,
      [{ paymentMethod: PaymentMethod.EFECTIVO, amount: 100 }],
      undefined,
      undefined,
      discountAmount,
    );

  beforeEach(() => {
    jest.restoreAllMocks();
    transaction.mockReset();
  });

  it('rechaza importes manipulados ANTES de abrir una transacción', async () => {
    const command = build([{ variantId: 'v1', quantity: 1, price: 10, discountAmount: 99 }]);

    const error: unknown = await handler.execute(command).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(ErrorCode.InvalidSaleAmounts);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza un descuento global mayor al total', async () => {
    await expect(handler.execute(build([{ variantId: 'v1', quantity: 1, price: 10 }], 50))).rejects.toMatchObject({
      code: ErrorCode.InvalidSaleAmounts,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('exige acceso a la sucursal: un usuario sin esa sucursal no puede vender', async () => {
    transaction.mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) => cb({} as EntityManager));
    const access = jest
      .spyOn(branchAccess, 'assertUserCanOperateInBranch')
      .mockRejectedValue(new ForbiddenException('No tienes permisos para registrar ventas en la sucursal seleccionada.'));

    await expect(handler.execute(build([{ variantId: 'v1', quantity: 1, price: 10 }]))).rejects.toThrow(ForbiddenException);
    expect(access).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ tenantId: 't1', userId: 'u1', branchId: 'b1' }),
    );
  });

  it('un cajero no asignado a la caja de la sesión no puede vender (aunque tenga la sucursal)', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 's1', cashRegisterId: 'r1', branch: { code: 1 } });
    const tm = { query: jest.fn().mockResolvedValue([]), getRepository: () => ({ findOne }) } as unknown as EntityManager;
    transaction.mockImplementation((cb: (manager: EntityManager) => Promise<unknown>) => cb(tm));
    jest.spyOn(branchAccess, 'assertUserCanOperateInBranch').mockResolvedValue(undefined);
    const access = jest
      .spyOn(registerAccess, 'assertUserAssignedToCashRegister')
      .mockRejectedValue(new ForbiddenException('Caja no asignada'));

    await expect(handler.execute(build([{ variantId: 'v1', quantity: 1, price: 10 }]))).rejects.toThrow(ForbiddenException);
    expect(access).toHaveBeenCalledWith(
      tm,
      expect.objectContaining({ tenantId: 't1', userId: 'u1', cashRegisterId: 'r1' }),
    );
  });
});
