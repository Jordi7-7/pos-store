import { GetTenantMetadataHandler } from './get-tenant-metadata.handler';

describe('GetTenantMetadataHandler', () => {
  const handler = new GetTenantMetadataHandler();

  it('ofrece países, monedas y zonas horarias ordenados por nombre, con lo que usa el onboarding', async () => {
    const { countries, currencies, timezones } = await handler.execute();

    expect(countries).toContainEqual({ code: 'EC', name: expect.any(String) as string });
    expect(currencies.find((currency) => currency.code === 'USD')).toMatchObject({ symbol: '$' });
    expect(timezones.find((timezone) => timezone.name === 'America/Guayaquil')).toMatchObject({ countries: expect.arrayContaining(['EC']) as string[] });

    for (const list of [countries, currencies, timezones]) {
      const names = list.map((item) => item.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });
});
