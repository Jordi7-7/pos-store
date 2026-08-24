import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../domain/entities/tenant.entity';
import { UpdateTenantDto } from '../../infrastructure/dtos/update-tenant.dto';
import cc from 'currency-codes';
import getSymbolFromCurrency from 'currency-symbol-map';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);

    if (dto.name !== undefined) {
      tenant.name = dto.name;
    }
    if (dto.country !== undefined) {
      tenant.country = dto.country;
    }
    if (dto.currencyCode !== undefined) {
      tenant.currencyCode = dto.currencyCode;
      // Derive symbol from code
      const symbol = getSymbolFromCurrency(dto.currencyCode);
      tenant.currencySymbol = symbol || '$';
    }
    if (dto.timezone !== undefined) {
      tenant.timezone = dto.timezone;
    }

    return this.tenantRepository.save(tenant);
  }

  async getMetadata() {
    const ct = await import('countries-and-timezones');
    // Get list of all countries
    const rawCountries = ct.getAllCountries();
    const countries = Object.values(rawCountries).map((c) => ({
      code: c.id,
      name: c.name,
    })).sort((a, b) => a.name.localeCompare(b.name));

    // Get list of all currencies
    const currencies = cc.codes().map((code) => {
      const details = cc.code(code);
      const symbol = getSymbolFromCurrency(code) || '';
      return {
        code,
        name: details ? details.currency : code,
        symbol,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    // Get list of all timezones
    const rawTimezones = ct.getAllTimezones();
    const timezones = Object.values(rawTimezones).map((t) => ({
      name: t.name,
      utcOffsetStr: t.utcOffsetStr,
      countries: t.countries,
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      countries,
      currencies,
      timezones,
    };
  }
}
