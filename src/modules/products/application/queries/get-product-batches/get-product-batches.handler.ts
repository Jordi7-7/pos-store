import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductBatchesQuery } from './get-product-batches.query';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';

@QueryHandler(GetProductBatchesQuery)
export class GetProductBatchesHandler implements IQueryHandler<GetProductBatchesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductBatchesQuery) {
    const { tenantId, branchId, search, status, page, limit } = query;
    const repo = this.entityManager.getRepository(ProductBatch);

    const qb = repo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('batch.branch', 'branch')
      .leftJoinAndSelect('batch.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.supplier', 'supplier')
      .where('batch.tenantId = :tenantId', { tenantId });

    if (branchId) {
      qb.andWhere('batch.branchId = :branchId', { branchId });
    }

    if (status === 'active') {
      qb.andWhere('batch.remainingQuantity > 0');
    } else if (status === 'exhausted') {
      qb.andWhere('batch.remainingQuantity <= 0');
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(product.name) LIKE :term OR LOWER(variant.sku) LIKE :term OR LOWER(purchaseOrder.invoiceNumber) LIKE :term)',
        { term },
      );
    }

    const [batches, total] = await qb
      .orderBy('batch.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = batches.map((b) => {
      let originType: 'PURCHASE' | 'INITIAL_STOCK' | 'REFUND' | 'ADJUSTMENT' = 'ADJUSTMENT';
      let originLabel = 'Ajuste / Entrada manual';
      let originReference = '';

      if (b.purchaseOrderId && b.purchaseOrder) {
        originType = 'PURCHASE';
        originLabel = `Compra (${b.purchaseOrder.supplier?.name || 'Proveedor'})`;
        originReference = b.purchaseOrder.invoiceNumber ? `Doc: ${b.purchaseOrder.invoiceNumber}` : `OC #${b.purchaseOrder.id.slice(0, 8)}`;
      } else if (!b.purchaseOrderId) {
        // Without purchaseOrderId, can be refund, initial stock or adjustment
        // We describe it gracefully
        originType = 'INITIAL_STOCK';
        originLabel = 'Stock inicial / Ajuste';
        originReference = 'Inventario directo';
      }

      const initialQty = Number(b.initialQuantity || 0);
      const remainingQty = Number(b.remainingQuantity || 0);
      const consumedQty = Math.max(0, initialQty - remainingQty);
      const unitCost = Number(b.unitCost || 0);
      const totalCostValue = Number((remainingQty * unitCost).toFixed(2));

      return {
        id: b.id,
        createdAt: b.createdAt,
        branchId: b.branchId,
        branchName: b.branch?.name || 'Sucursal',
        variantId: b.variantId,
        productName: b.variant?.product?.name || 'Producto sin nombre',
        sku: b.variant?.sku || '',
        barcode: b.variant?.barcode || '',
        initialQuantity: initialQty,
        remainingQuantity: remainingQty,
        consumedQuantity: consumedQty,
        unitCost,
        totalCostValue,
        originType,
        originLabel,
        originReference,
        purchaseOrderId: b.purchaseOrderId,
        status: remainingQty > 0 ? 'ACTIVE' : 'EXHAUSTED',
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
