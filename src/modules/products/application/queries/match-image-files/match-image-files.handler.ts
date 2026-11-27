import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { MatchImageFilesQuery } from './match-image-files.query';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { comparableName, createImageMatcher, FileMatch, fileStems } from '../../../domain/image-file-match';
import { normalizeSku } from '../../../domain/sku';

@QueryHandler(MatchImageFilesQuery)
export class MatchImageFilesHandler implements IQueryHandler<MatchImageFilesQuery, FileMatch[]> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute({ tenantId, fileNames }: MatchImageFilesQuery): Promise<FileMatch[]> {
    const stems = fileNames.flatMap(fileStems);
    // De los productos solo hace falta el nombre y el SKU base; las variantes se cargan solo las que pueden coincidir
    const products = await this.entityManager.getRepository(Product).find({ where: { tenantId }, select: { id: true, name: true, type: true, baseSku: true } });

    const comparableStems = stems.map(comparableName);
    const namedProductIds = products
      .filter((product) => {
        const prefix = `${comparableName(product.name)} `;
        return comparableStems.some((stem) => stem.startsWith(prefix));
      })
      .map((product) => product.id);

    const skus = [...new Set(stems.map(normalizeSku))];
    const variants = await this.entityManager.getRepository(ProductVariant).find({
      where: [{ tenantId, sku: In(skus) }, ...(namedProductIds.length > 0 ? [{ tenantId, productId: In(namedProductIds) }] : [])],
      relations: { attributeValues: true },
    });

    const match = createImageMatcher(
      products,
      variants.map((variant) => ({ id: variant.id, productId: variant.productId, sku: variant.sku, attributeValues: (variant.attributeValues ?? []).map((value) => value.value) })),
    );
    return fileNames.map(match);
  }
}
