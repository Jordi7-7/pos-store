export class OpenCashSessionCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly branchId: string,
    public readonly openingBalance: number,
  ) {}
}
