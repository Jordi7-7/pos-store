import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { GetPurchasesQuery } from './get-purchases.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { Batch } from '../../../../batches/domain/entities/batch.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';
import { parseReportDates } from '../../../../reports/application/queries/parse-dates.helper';
import { PurchaseOrderStatus } from '../../../../purchases/domain/enums/purchase-order-status.enum';

export type PurchaseListItem = PurchaseOrder & { isCancellable: boolean };

export interface PurchasesPage {
  data: PurchaseListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

@QueryHandler(GetPurchasesQuery)
export class GetPurchasesHandler implements IQueryHandler<GetPurchasesQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetPurchasesQuery): Promise<PurchasesPage> {
    const { tenantId, branchId, userId, isOwner, startDateStr, endDateStr, supplierId, page, limit } = query;
    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      isOwner,
      branchId,
      actionDescription: 'consultar las compras',
    });

    const qb = this.entityManager.getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.branch', 'branch')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('po.tenantId = :tenantId', { tenantId });

    if (branchId) {
      qb.andWhere('po.branchId = :branchId', { branchId });
    }

    if (supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId });
    }

    if (startDateStr || endDateStr) {
      const { start, end } = await parseReportDates(
        this.entityManager,
        tenantId,
        startDateStr,
        endDateStr,
      );
      qb.andWhere('po.createdAt BETWEEN :start AND :end', { start, end });
    }

    qb.orderBy('po.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [orders, total] = await qb.getManyAndCount();

    // Una sola consulta de lotes para toda la página (antes era una por orden)
    const completedIds = orders.filter((order) => order.status === PurchaseOrderStatus.COMPLETED).map((order) => order.id);
    const intactOrderIds = await this.findOrdersWithIntactBatches(completedIds);

    const data = orders.map((order) => ({ ...order, isCancellable: intactOrderIds.has(order.id) }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Órdenes cuyos lotes siguen intactos (nada vendido de ellos): solo esas se pueden cancelar. */
  private async findOrdersWithIntactBatches(orderIds: string[]): Promise<Set<string>> {
    if (orderIds.length === 0) return new Set();

    const headers = await this.entityManager.getRepository(Batch).find({
      where: { purchaseOrderId: In(orderIds) },
      relations: { items: true },
    });

    const intact = new Set(orderIds);
    for (const header of headers) {
      const consumed = (header.items ?? []).some((batch) => Number(batch.remainingQuantity) !== Number(batch.initialQuantity));
      if (consumed && header.purchaseOrderId) intact.delete(header.purchaseOrderId);
    }
    return intact;
  }
}
