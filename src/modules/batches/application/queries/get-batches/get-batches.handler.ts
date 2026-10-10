import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetBatchesQuery } from './get-batches.query';
import { Batch, BatchOriginType } from '../../../domain/entities/batch.entity';
import { parseReportDates } from '../../../../reports/application/queries/parse-dates.helper';
import { UserRole } from '../../../../users/enums/user-role.enum';

@QueryHandler(GetBatchesQuery)
export class GetBatchesHandler implements IQueryHandler<GetBatchesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetBatchesQuery) {
    const { tenantId, branchId, startDateStr, endDateStr, search, page, limit, userId, userRole } = query;
    const batchRepo = this.entityManager.getRepository(Batch);

    const qb = batchRepo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.branch', 'branch')
      .leftJoinAndSelect('batch.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.supplier', 'supplier')
      .leftJoinAndSelect('batch.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('batch.tenantId = :tenantId', { tenantId });

    const isOwner = userRole === UserRole.OWNER;
    if (isOwner) {
      if (branchId) {
        qb.andWhere('batch.branchId = :branchId', { branchId });
      }
    } else {
      if (!branchId) {
        throw new BadRequestException('Debes seleccionar una sucursal para consultar los lotes de inventario.');
      }

      const user = await this.entityManager.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      const userBranchIds = (user || []).map((r: any) => r.branch_id);

      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar lotes en la sucursal seleccionada.');
      }

      qb.andWhere('batch.branchId = :branchId', { branchId });
    }

    if (startDateStr || endDateStr) {
      const { start, end } = await parseReportDates(
        this.entityManager,
        tenantId,
        startDateStr,
        endDateStr,
      );
      qb.andWhere('batch.createdAt BETWEEN :start AND :end', { start, end });
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(batch.code) LIKE :term OR LOWER(product.name) LIKE :term OR LOWER(variant.sku) LIKE :term OR LOWER(purchaseOrder.invoiceNumber) LIKE :term)',
        { term },
      );
    }

    const [batches, total] = await qb
      .orderBy('batch.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = batches.map((batch) => {
      let originLabel = 'Stock inicial';
      let originReference = batch.code || 'Lote Directo';

      switch (batch.originType) {
        case BatchOriginType.PURCHASE: {
          const supplierName = batch.purchaseOrder?.supplier?.name || 'Proveedor';
          originLabel = `Compra (${supplierName})`;
          originReference = batch.purchaseOrder?.invoiceNumber
            ? `Factura: ${batch.purchaseOrder.invoiceNumber}`
            : batch.code || (batch.purchaseOrderId ? `OC #${batch.purchaseOrderId.slice(0, 8)}` : 'Compra');
          break;
        }
        case BatchOriginType.REFUND:
          originLabel = 'Devolución de cliente';
          break;
        case BatchOriginType.ADJUSTMENT:
          originLabel = 'Ajuste de inventario';
          break;
        case BatchOriginType.INITIAL_STOCK:
        default:
          originLabel = 'Stock inicial';
          break;
      }

      let totalInitialQuantity = 0;
      let totalRemainingQuantity = 0;
      let totalCostValue = 0;
      let totalInitialCostValue = 0;

      const items = (batch.items || []).map((item) => {
        const initialQty = Number(item.initialQuantity || 0);
        const remainingQty = Number(item.remainingQuantity || 0);
        const consumedQty = Math.max(0, initialQty - remainingQty);
        const unitCost = Number(item.unitCost || 0);
        const itemTotalCostValue = Number((remainingQty * unitCost).toFixed(2));
        const itemInitialCostValue = Number((initialQty * unitCost).toFixed(2));

        totalInitialQuantity += initialQty;
        totalRemainingQuantity += remainingQty;
        totalCostValue += itemTotalCostValue;
        totalInitialCostValue += itemInitialCostValue;

        return {
          id: item.id,
          createdAt: item.createdAt,
          variantId: item.variantId,
          productName: item.variant?.product?.name || 'Producto sin nombre',
          sku: item.variant?.sku || '',
          barcode: item.variant?.barcode || '',
          initialQuantity: initialQty,
          remainingQuantity: remainingQty,
          consumedQuantity: consumedQty,
          unitCost,
          totalCostValue: itemTotalCostValue,
          initialCostValue: itemInitialCostValue,
        };
      });

      return {
        id: batch.id,
        purchaseOrderId: batch.purchaseOrderId,
        code: batch.code,
        createdAt: batch.createdAt,
        branchId: batch.branchId,
        branchName: batch.branch?.name || 'Sucursal',
        originType: batch.originType,
        originLabel,
        originReference,
        totalInitialQuantity,
        totalRemainingQuantity,
        totalCostValue: Number(totalCostValue.toFixed(2)),
        totalInitialCostValue: Number(totalInitialCostValue.toFixed(2)),
        status:
          batch.status === 'CANCELLED'
            ? 'CANCELLED'
            : totalRemainingQuantity > 0
              ? 'ACTIVE'
              : 'DEPLETED',
        items,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
