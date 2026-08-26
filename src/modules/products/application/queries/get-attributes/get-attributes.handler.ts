import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetAttributesQuery } from './get-attributes.query';
import { Attribute } from '../../../domain/entities/attribute.entity';

@QueryHandler(GetAttributesQuery)
export class GetAttributesHandler implements IQueryHandler<GetAttributesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetAttributesQuery): Promise<Attribute[]> {
    const repo = this.entityManager.getRepository(Attribute);
    return repo.find({
      where: { tenantId: query.tenantId },
      relations: {
        values: true,
      },
    });
  }
}
