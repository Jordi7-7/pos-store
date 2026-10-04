import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException } from '@nestjs/common';
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

    if (items.length > 3000) {
      throw new BadRequestException(
        `El archivo contiene ${items.length} filas. El límite máximo permitido por importación es de 3,000 registros.`,
      );
    }

    const variants: ProductVariant[] = [];
    const CHUNK_SIZE = 500;
    for (let i = 0; i < skus.length; i += CHUNK_SIZE) {
      const chunk = skus.slice(i, i + CHUNK_SIZE);
      const chunkVariants = await variantRepo.find({
        where: { sku: In(chunk), tenantId },
        relations: { product: true },
      });
      variants.push(...chunkVariants);
    }

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
