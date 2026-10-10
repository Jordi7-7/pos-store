import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { GetPurchasesQuery } from './get-purchases.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { Batch } from '../../../../batches/domain/entities/batch.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

@QueryHandler(GetPurchasesQuery)
export class GetPurchasesHandler implements IQueryHandler<GetPurchasesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPurchasesQuery): Promise<any[]> {
    const { tenantId, branchId, userId, userRole } = query;
    const purchaseRepo = this.entityManager.getRepository(PurchaseOrder);
    const batchHeaderRepo = this.entityManager.getRepository(Batch);

    const whereClause: any = { tenantId };

    const isOwner = userRole === UserRole.OWNER;
    if (isOwner) {
      if (branchId) {
        whereClause.branchId = branchId;
      }
    } else {
      if (!branchId) {
        throw new BadRequestException('Debes seleccionar una sucursal para consultar las compras.');
      }

      const user = await this.entityManager.findOne(User, {
        where: { id: userId, tenantId },
        relations: { branches: true },
      });
      const userBranchIds = (user?.branches || []).map((b) => b.id);

      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar compras en la sucursal seleccionada.');
      }

      whereClause.branchId = branchId;
    }

    const orders = await purchaseRepo.find({
      where: whereClause,
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
