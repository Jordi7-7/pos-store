import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { GetPublicTenantBySlugQuery } from './get-public-tenant-by-slug.query';
import { Tenant } from '../../../domain/entities/tenant.entity';

export interface PublicTenantDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  country: string;
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
}

@QueryHandler(GetPublicTenantBySlugQuery)
export class GetPublicTenantBySlugHandler implements IQueryHandler<GetPublicTenantBySlugQuery, PublicTenantDto> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPublicTenantBySlugQuery): Promise<PublicTenantDto> {
    const slug = query.slug.toLowerCase().trim();
    const tenant = await this.entityManager.findOne(Tenant, {
      where: { slug },
    });

    if (!tenant) {
      throw new NotFoundException(`Tienda con identificador "${query.slug}" no encontrada`);
    }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl || null,
      country: tenant.country,
      currencyCode: tenant.currencyCode,
      currencySymbol: tenant.currencySymbol,
      timezone: tenant.timezone,
    };
  }
}
