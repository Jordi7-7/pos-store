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
      // Las opciones salen en el orden que la tienda les dio (S, M, L…); a igualdad, las más antiguas primero
      order: { values: { sortOrder: 'ASC', createdAt: 'ASC', id: 'ASC' } },
    });
  }
}
