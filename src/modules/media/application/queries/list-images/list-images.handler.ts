import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { ListImagesQuery } from './list-images.query';
import { ProductImage } from '../../../../products/domain/entities/product-image.entity';
import { containsPattern } from '../../../../../common/utils/like';

const DEFAULT_PAGE_SIZE = 20;
/** Sin parámetros de paginación se devuelve la galería completa hasta este tope. */
const UNPAGINATED_MAX = 1000;

export interface ImagesPage {
  data: ProductImage[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

@QueryHandler(ListImagesQuery)
export class ListImagesHandler implements IQueryHandler<ListImagesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ListImagesQuery): Promise<ImagesPage> {
    const { tenantId, search } = query;
    const isPaginated = query.page !== undefined || query.limit !== undefined;
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE);

    const qb = this.entityManager
      .getRepository(ProductImage)
      .createQueryBuilder('image')
      .where('image.tenantId = :tenantId', { tenantId })
      .orderBy('image.createdAt', 'DESC');

    if (search && search.trim() !== '') {
      qb.andWhere('image.description ILIKE :search', { search: containsPattern(search) });
    }

    if (isPaginated) {
      const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 } };
    }

    const [data, total] = await qb.take(UNPAGINATED_MAX).getManyAndCount();
    return { data, meta: { total, page: 1, limit: total, totalPages: 1 } };
  }
}
