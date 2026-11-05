export interface UpdateTenantInput {
  name?: string;
  country?: string;
  currencyCode?: string;
  timezone?: string;
  slug?: string;
  logoUrl?: string;
}

export class UpdateTenantCommand {
  constructor(
    public readonly id: string,
    public readonly input: UpdateTenantInput,
  ) {}
}
