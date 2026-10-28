export class OnboardTenantCommand {
  constructor(
    public readonly tenantName: string,
    public readonly ruc: string,
    public readonly country: string,
    public readonly currencyCode: string,
    public readonly currencySymbol: string,
    public readonly timezone: string,
    public readonly adminName: string,
    public readonly username: string,
    public readonly password: string,
    public readonly branchName: string,
    public readonly branchAddress: string,
    public readonly email?: string | null,
    public readonly slug?: string,
  ) {}
}
