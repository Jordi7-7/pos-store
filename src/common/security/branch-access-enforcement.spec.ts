import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import * as branchAccess from './branch-access.helper';
import { CreateInventoryDocumentCommand } from '../../modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { CreateInventoryDocumentHandler } from '../../modules/products/application/commands/create-inventory-document/create-inventory-document.handler';
import { InventoryDocumentKind } from '../enums/inventory-document-kind.enum';
import { ImportProductsCommand } from '../../modules/products/application/commands/import-products/import-products.command';
import { ImportProductsHandler } from '../../modules/products/application/commands/import-products/import-products.handler';
import { CancelPurchaseOrderCommand } from '../../modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.command';
import { CancelPurchaseOrderHandler } from '../../modules/purchases/application/commands/cancel-purchase-order/cancel-purchase-order.handler';
import { ImportPurchasesCommand } from '../../modules/purchases/application/commands/import-purchases/import-purchases.command';
import { ImportPurchasesHandler } from '../../modules/purchases/application/commands/import-purchases/import-purchases.handler';
import { RegisterPurchaseCommand } from '../../modules/purchases/application/commands/register-purchase/register-purchase.command';
import { RegisterPurchaseHandler } from '../../modules/purchases/application/commands/register-purchase/register-purchase.handler';

/**
 * Todo comando que escribe stock en una sucursal debe verificar que el usuario tiene
 * asignada esa sucursal ANTES de tocar datos.
 */
describe('Acceso a sucursal en comandos de stock y compras', () => {
  const dataAccess = jest.fn();
  const tm = {
    query: dataAccess,
    getRepository: () => ({
      findOne: dataAccess.mockResolvedValue({ id: 'o1', branchId: 'b1', status: 'COMPLETED', items: [] }),
      find: dataAccess,
      save: dataAccess,
    }),
  } as unknown as EntityManager;
  const entityManager = {
    transaction: (cb: (m: EntityManager) => Promise<unknown>) => cb(tm),
  } as unknown as EntityManager;
  const redis = {} as unknown as RedisService;

  let access: jest.SpyInstance;

  beforeEach(() => {
    dataAccess.mockReset().mockResolvedValue([]);
    access = jest
      .spyOn(branchAccess, 'assertUserCanOperateInBranch')
      .mockRejectedValue(new ForbiddenException('Sin acceso a la sucursal.'));
  });

  afterEach(() => jest.restoreAllMocks());

  const cases: Array<[string, () => Promise<unknown>, string]> = [
    [
      'CreateInventoryDocument',
      () => new CreateInventoryDocumentHandler(entityManager, redis).execute(new CreateInventoryDocumentCommand('t1', 'u1', 'b1', InventoryDocumentKind.ENTRY, 'DONACION', [{ variantId: 'v1', quantity: 1 }])),
      'b1',
    ],
    [
      'RegisterPurchase',
      () =>
        new RegisterPurchaseHandler(entityManager, redis).execute(
          new RegisterPurchaseCommand('t1', 'u1', 's1', 'b1', null, [{ variantId: 'v1', quantity: 1, purchasePrice: 1 }]),
        ),
      'b1',
    ],
    [
      'ImportPurchases',
      () =>
        new ImportPurchasesHandler(entityManager, redis).execute(
          new ImportPurchasesCommand('t1', 'u1', 'b1', [{ sku: 'A', quantity: 1, purchasePrice: 1 }] as never),
        ),
      'b1',
    ],
    [
      'ImportProducts',
      () =>
        new ImportProductsHandler(entityManager, redis).execute(
          new ImportProductsCommand('t1', 'u1', 'b1', [{ name: 'x' }] as never),
        ),
      'b1',
    ],
    [
      'CancelPurchaseOrder',
      () => new CancelPurchaseOrderHandler(entityManager, redis).execute(new CancelPurchaseOrderCommand('t1', 'u1', 'o1')),
      'b1',
    ],
  ];

  it.each(cases)('%s rechaza a un usuario sin acceso a la sucursal', async (_name, run, branchId) => {
    await expect(run()).rejects.toThrow(ForbiddenException);
    expect(access).toHaveBeenCalledWith(
      expect.anything(),
      redis,
      expect.objectContaining({ tenantId: 't1', userId: 'u1', branchId }),
    );
  });
});
