import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager, Not } from 'typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UpdateTenantCommand } from './update-tenant.command';
import { Tenant } from '../../../domain/entities/tenant.entity';
import getSymbolFromCurrency from 'currency-symbol-map';

@CommandHandler(UpdateTenantCommand)
export class UpdateTenantHandler implements ICommandHandler<UpdateTenantCommand> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateTenantCommand): Promise<Tenant> {
    const { id, dto } = command;
    const tenant = await this.entityManager.findOne(Tenant, { where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    if (dto.name !== undefined) {
      tenant.name = dto.name;
    }
    if (dto.slug !== undefined) {
      const cleanSlug = dto.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const existingSlugTenant = await this.entityManager.findOne(Tenant, {
        where: { slug: cleanSlug, id: Not(id) },
      });
      if (existingSlugTenant) {
        throw new ConflictException(`El identificador "${cleanSlug}" ya está en uso por otra tienda`);
      }
      tenant.slug = cleanSlug;
    }
    if (dto.logoUrl !== undefined) {
      tenant.logoUrl = dto.logoUrl ? dto.logoUrl.trim() : null;
    }
    if (dto.country !== undefined) {
      tenant.country = dto.country;
    }
    if (dto.currencyCode !== undefined) {
      tenant.currencyCode = dto.currencyCode;
      const symbol = getSymbolFromCurrency(dto.currencyCode);
      tenant.currencySymbol = symbol || '$';
    }
    if (dto.timezone !== undefined) {
      tenant.timezone = dto.timezone;
    }

    return this.entityManager.save(Tenant, tenant);
  }
}
