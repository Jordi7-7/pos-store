import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { GetPurchasesQuery } from './get-purchases.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { Batch } from '../../../../batches/domain/entities/batch.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';
import { parseReportDates } from '../../../../reports/application/queries/parse-dates.helper';

@QueryHandler(GetPurchasesQuery)
export class GetPurchasesHandler implements IQueryHandler<GetPurchasesQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetPurchasesQuery): Promise<any> {
    const { tenantId, branchId, userId, userRole, startDateStr, endDateStr, supplierId, page, limit } = query;
    const batchHeaderRepo = this.entityManager.getRepository(Batch);

    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      userRole,
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

    const data = await Promise.all(
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
}
