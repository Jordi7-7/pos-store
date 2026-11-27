import { HttpStatus } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetBatchLabelsQuery } from './get-batch-labels.query';
import { Batch } from '../../../domain/entities/batch.entity';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

/** Un producto (o variante) que llegó en el lote, con lo necesario para imprimir sus etiquetas. */
export interface BatchLabelLine {
  variantId: string;
  sku: string;
  productName: string;
  /** Precio de venta vigente (no el costo del lote). */
  salePrice: number;
  /** Valores de la variante, ordenados por el nombre del atributo; vacío en un producto simple. */
  attributes: string[];
  /** Unidades que entraron en el lote, aunque ya se hayan vendido. */
  quantity: number;
}

export interface BatchLabels {
  batchId: string;
  lines: BatchLabelLine[];
  /** Líneas del lote cuyo producto ya se eliminó: no se pueden etiquetar. */
  unavailable: number;
}

@QueryHandler(GetBatchLabelsQuery)
export class GetBatchLabelsHandler implements IQueryHandler<GetBatchLabelsQuery, BatchLabels> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute({ tenantId, batchId, userId, isOwner }: GetBatchLabelsQuery): Promise<BatchLabels> {
    const batch = await this.entityManager
      .getRepository(Batch)
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValue')
      .leftJoinAndSelect('attributeValue.attribute', 'attribute')
      .where('batch.id = :batchId', { batchId })
      .andWhere('batch.tenantId = :tenantId', { tenantId })
      .getOne();

    if (!batch) {
      throw new AppException(ErrorCode.BatchNotFound, 'El lote no existe.', HttpStatus.NOT_FOUND);
    }

    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId,
      isOwner,
      branchId: batch.branchId,
      actionDescription: 'imprimir las etiquetas del lote',
    });

    const lines = new Map<string, BatchLabelLine>();
    let unavailable = 0;
    for (const item of batch.items ?? []) {
      const variant = item.variant;
      if (!variant?.product) {
        unavailable += 1;
        continue;
      }
      // La misma variante puede entrar en dos líneas del lote: es una sola etiqueta con la suma
      const line = lines.get(variant.id);
      if (line) {
        line.quantity += Number(item.initialQuantity);
        continue;
      }
      lines.set(variant.id, {
        variantId: variant.id,
        sku: variant.sku,
        productName: variant.product.name,
        salePrice: Number(variant.salePrice),
        attributes: [...(variant.attributeValues ?? [])]
          .sort((a, b) => (a.attribute?.name ?? '').localeCompare(b.attribute?.name ?? '', 'es'))
          .map((value) => value.value),
        quantity: Number(item.initialQuantity),
      });
    }

    return {
      batchId: batch.id,
      lines: [...lines.values()].sort((a, b) => a.sku.localeCompare(b.sku, 'es', { numeric: true })),
      unavailable,
    };
  }
}
