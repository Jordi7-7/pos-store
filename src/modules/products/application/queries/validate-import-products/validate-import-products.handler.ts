import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { ValidateImportProductsQuery } from './validate-import-products.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';

@QueryHandler(ValidateImportProductsQuery)
export class ValidateImportProductsHandler implements IQueryHandler<ValidateImportProductsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ValidateImportProductsQuery): Promise<{ errors: Record<string, string> }> {
    const { tenantId, items } = query;
    const variantRepo = this.entityManager.getRepository(ProductVariant);
    const skus = items.map((it) => it.sku.trim());

    if (skus.length === 0) {
      return { errors: {} };
    }

    const existingVariants = await variantRepo.find({
      where: { sku: In(skus), tenantId },
      select: { sku: true },
    });

    const existingSkusSet = new Set(existingVariants.map((v) => v.sku.toLowerCase()));
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
