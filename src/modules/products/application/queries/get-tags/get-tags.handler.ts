import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetTagsQuery } from './get-tags.query';
import { Tag } from '../../../domain/entities/tag.entity';

@QueryHandler(GetTagsQuery)
export class GetTagsHandler implements IQueryHandler<GetTagsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetTagsQuery): Promise<Tag[]> {
    const repo = this.entityManager.getRepository(Tag);
    return repo.find({
      where: { tenantId: query.tenantId },
      order: { name: 'ASC' },
    });
  }
}
