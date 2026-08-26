import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetTenantMetadataQuery } from './get-tenant-metadata.query';
import cc from 'currency-codes';
import getSymbolFromCurrency from 'currency-symbol-map';

@QueryHandler(GetTenantMetadataQuery)
export class GetTenantMetadataHandler implements IQueryHandler<GetTenantMetadataQuery> {
  async execute() {
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
