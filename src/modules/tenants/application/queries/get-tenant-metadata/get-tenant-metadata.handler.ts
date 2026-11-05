import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetTenantMetadataQuery } from './get-tenant-metadata.query';
import * as ct from 'countries-and-timezones';
import cc from 'currency-codes';
import getSymbolFromCurrency from 'currency-symbol-map';

export type TenantMetadata = ReturnType<GetTenantMetadataHandler['buildMetadata']>;

@QueryHandler(GetTenantMetadataQuery)
export class GetTenantMetadataHandler implements IQueryHandler<GetTenantMetadataQuery> {
  execute(): Promise<TenantMetadata> {
    return Promise.resolve(this.buildMetadata());
  }

  private buildMetadata() {
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
