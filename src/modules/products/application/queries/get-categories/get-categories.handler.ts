import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetCategoriesQuery } from './get-categories.query';
import { Category } from '../../../domain/entities/category.entity';

@QueryHandler(GetCategoriesQuery)
export class GetCategoriesHandler implements IQueryHandler<GetCategoriesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetCategoriesQuery): Promise<Category[]> {
    const { tenantId } = query;
    const categoryRepo = this.entityManager.getRepository(Category);
    return categoryRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }
}
