import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { GetTenantQuery } from './get-tenant.query';
import { Tenant } from '../../../domain/entities/tenant.entity';

@QueryHandler(GetTenantQuery)
export class GetTenantHandler implements IQueryHandler<GetTenantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetTenantQuery): Promise<Tenant> {
    const tenant = await this.entityManager.findOne(Tenant, {
      where: { id: query.id },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${query.id} not found`);
    }
    return tenant;
  }
}
