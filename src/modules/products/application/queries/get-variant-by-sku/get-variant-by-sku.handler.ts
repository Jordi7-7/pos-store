import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetVariantBySkuQuery } from './get-variant-by-sku.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { VariantLookupResponse } from '../../read-models/pos-variant-response';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@QueryHandler(GetVariantBySkuQuery)
export class GetVariantBySkuHandler implements IQueryHandler<GetVariantBySkuQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetVariantBySkuQuery): Promise<VariantLookupResponse> {
    const { tenantId, sku } = query;
    const repo = this.entityManager.getRepository(ProductVariant);

    const variant = await repo.createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .select([
        'variant.id',
        'variant.sku',
        'variant.purchasePrice',
        'product.name'
      ])
      .where('variant.tenantId = :tenantId', { tenantId })
      .andWhere('LOWER(variant.sku) = LOWER(:sku)', { sku: sku.trim() })
      .getOne();

    if (!variant) {
      throw new AppException(ErrorCode.VariantNotFound, `Variante con SKU ${sku} no encontrada`, HttpStatus.NOT_FOUND, { sku });
    }

    return {
      id: variant.id,
      sku: variant.sku,
      purchasePrice: variant.purchasePrice,
      productName: variant.product.name,
    };
  }
}
