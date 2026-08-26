import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { ValidateImportPurchasesQuery } from './validate-import-purchases.query';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';

@QueryHandler(ValidateImportPurchasesQuery)
export class ValidateImportPurchasesHandler implements IQueryHandler<ValidateImportPurchasesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ValidateImportPurchasesQuery): Promise<{ errors: Record<string, string>; names: Record<string, string> }> {
    const { tenantId, items } = query;
    const variantRepo = this.entityManager.getRepository(ProductVariant);
    const skus = items.map((it) => it.sku.trim());

    if (skus.length === 0) {
      return { errors: {}, names: {} };
    }

    const variants = await variantRepo.find({
      where: { sku: In(skus), tenantId },
      relations: { product: true },
    });

    const variantMap = new Map(variants.map((v) => [v.sku.toLowerCase(), v]));
    const errors: Record<string, string> = {};
    const names: Record<string, string> = {};
    const fileSkusSet = new Set<string>();

    for (const item of items) {
      const skuLower = item.sku.trim().toLowerCase();

      if (fileSkusSet.has(skuLower)) {
        errors[item.sku] = 'SKU duplicado en el mismo archivo de Excel.';
      } else {
        fileSkusSet.add(skuLower);
      }

      const match = variantMap.get(skuLower);
      if (!match) {
        errors[item.sku] = 'Este SKU no existe en el catálogo de productos.';
      } else {
        names[item.sku] = match.product.name;
      }
    }

    return { errors, names };
  }
}
