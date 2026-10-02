import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPurchasesQuery } from './get-purchases.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { Batch } from '../../../../batches/domain/entities/batch.entity';

@QueryHandler(GetPurchasesQuery)
export class GetPurchasesHandler implements IQueryHandler<GetPurchasesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPurchasesQuery): Promise<any[]> {
    const { tenantId } = query;
    const purchaseRepo = this.entityManager.getRepository(PurchaseOrder);
    const batchHeaderRepo = this.entityManager.getRepository(Batch);

    const orders = await purchaseRepo.find({
      where: { tenantId },
      relations: {
        supplier: true,
        branch: true,
        items: {
          variant: { product: true },
        },
      },
      order: { createdAt: 'DESC' },
    });

    const result = await Promise.all(
      orders.map(async (order) => {
        if (order.status !== 'COMPLETED') {
          return { ...order, isCancellable: false };
        }

        const batchHeaders = await batchHeaderRepo.find({
          where: { purchaseOrderId: order.id },
          relations: { items: true },
        });

        const batches = batchHeaders.flatMap((bh) => bh.items || []);

        const allIntact = batches.every(
          (b) => Number(b.remainingQuantity) === Number(b.initialQuantity),
        );

        return { ...order, isCancellable: allIntact };
      }),
    );

    return result;
  }
}
