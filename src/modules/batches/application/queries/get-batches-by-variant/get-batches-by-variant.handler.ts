import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetBatchesByVariantQuery } from './get-batches-by-variant.query';
import { ProductBatch } from '../../../../products/domain/entities/product-batch.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

@QueryHandler(GetBatchesByVariantQuery)
export class GetBatchesByVariantHandler implements IQueryHandler<GetBatchesByVariantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetBatchesByVariantQuery) {
    const { tenantId, variantId, page, limit, branchId, userId, userRole } = query;

    const qb = this.entityManager.getRepository(ProductBatch)
      .createQueryBuilder('pb')
      .innerJoinAndSelect('pb.batch', 'batch')
      .leftJoinAndSelect('batch.branch', 'branch')
      .leftJoinAndSelect('batch.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.supplier', 'supplier')
      .innerJoinAndSelect('pb.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .where('pb.tenantId = :tenantId', { tenantId })
      .andWhere('pb.variantId = :variantId', { variantId });

    const isOwner = userRole === UserRole.OWNER;
    if (isOwner) {
      if (branchId) {
        qb.andWhere('pb.branchId = :branchId', { branchId });
      }
    } else {
      if (!branchId) {
        throw new BadRequestException('Debes seleccionar una sucursal para consultar los lotes de la variante.');
      }

      const user = await this.entityManager.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      const userBranchIds = (user || []).map((r: any) => r.branch_id);

      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar lotes en la sucursal seleccionada.');
      }

      qb.andWhere('pb.branchId = :branchId', { branchId });
    }

    const [items, total] = await qb
      .orderBy('batch.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = items.map((pb) => {
      const batch = pb.batch;
      let originLabel = 'Stock inicial / Ajuste';
      let originReference = batch?.code || 'Lote Directo';

      if (batch?.originType === 'PURCHASE') {
        const supplierName = batch.purchaseOrder?.supplier?.name || 'Proveedor';
        originLabel = `Compra (${supplierName})`;
        originReference = batch.purchaseOrder?.invoiceNumber
          ? `Factura: ${batch.purchaseOrder.invoiceNumber}`
          : batch.code || (batch.purchaseOrderId ? `OC #${batch.purchaseOrderId.slice(0, 8)}` : 'Compra');
      } else if (batch?.originType === 'REFUND') {
        originLabel = 'Devolución de cliente';
      } else if (batch?.originType === 'ADJUSTMENT') {
        originLabel = 'Ajuste de inventario';
      }

      const initialQuantity = Number(pb.initialQuantity || 0);
      const remainingQuantity = Number(pb.remainingQuantity || 0);
      const consumedQuantity = Math.max(0, initialQuantity - remainingQuantity);
      const unitCost = Number(pb.unitCost || 0);

      return {
        id: pb.id,
        batchId: pb.batchId,
        batchCode: batch?.code || 'S/C',
        createdAt: batch?.createdAt || pb.createdAt,
        branchId: pb.branchId,
        branchName: pb.branch?.name || batch?.branch?.name || 'Sucursal Principal',
        originType: batch?.originType || 'INITIAL_STOCK',
        originLabel,
        originReference,
        sku: pb.variant?.sku || '',
        productName: pb.variant?.product?.name || 'Producto',
        initialQuantity,
        remainingQuantity,
        consumedQuantity,
        unitCost,
        totalCostValue: Number((remainingQuantity * unitCost).toFixed(2)),
        status: remainingQuantity > 0 ? 'ACTIVE' : 'DEPLETED',
      };
    });

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
