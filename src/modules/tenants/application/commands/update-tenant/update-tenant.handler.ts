import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
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
