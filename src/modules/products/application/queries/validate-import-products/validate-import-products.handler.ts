import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ValidateImportProductsQuery } from './validate-import-products.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

export interface ImportValidationResult {
  errors: Record<string, string>;
}

@QueryHandler(ValidateImportProductsQuery)
export class ValidateImportProductsHandler implements IQueryHandler<ValidateImportProductsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ValidateImportProductsQuery): Promise<ImportValidationResult> {
    const { tenantId, items } = query;
    const variantRepo = this.entityManager.getRepository(ProductVariant);
    const skus = items.map((it) => it.sku.trim());

    if (skus.length === 0) {
      return { errors: {} };
    }

    if (items.length > 3000) {
      throw new AppException(ErrorCode.ImportLimitExceeded, `El archivo contiene ${items.length} productos. El límite máximo permitido por importación es de 3,000 productos.`, HttpStatus.BAD_REQUEST, { received: items.length, max: 3000 });
    }

    const existingSkusSet = new Set<string>();
    const CHUNK_SIZE = 500;
    for (let i = 0; i < skus.length; i += CHUNK_SIZE) {
      const chunk = skus.slice(i, i + CHUNK_SIZE);
      const existingVariants = await variantRepo.find({
        where: { sku: In(chunk), tenantId },
        select: { sku: true },
      });
      existingVariants.forEach((v) => existingSkusSet.add(v.sku.toLowerCase()));
    }
    const errors: Record<string, string> = {};
    const fileSkusSet = new Set<string>();

    for (const item of items) {
      const skuLower = item.sku.trim().toLowerCase();
      if (fileSkusSet.has(skuLower)) {
        errors[item.sku] = 'SKU duplicado en el mismo archivo de Excel.';
      } else {
        fileSkusSet.add(skuLower);
      }

      if (existingSkusSet.has(skuLower)) {
        errors[item.sku] = 'Este SKU ya está registrado en el sistema.';
      }
    }

    return { errors };
  }
}
