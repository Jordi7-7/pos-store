export class ProcessRefundCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly saleId: string,
    public readonly cashSessionId: string,
    public readonly reason: string,
    public readonly items: any[],
  ) {}
}
