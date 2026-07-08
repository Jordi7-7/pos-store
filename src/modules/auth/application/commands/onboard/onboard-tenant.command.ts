export class OnboardTenantCommand {
  constructor(
    public readonly tenantName: string,
    public readonly ruc: string,
    public readonly country: string,
    public readonly currencyCode: string,
    public readonly currencySymbol: string,
    public readonly adminName: string,
    public readonly email: string,
    public readonly password: string,
    public readonly branchName: string,
    public readonly branchAddress: string,
  ) {}
}
