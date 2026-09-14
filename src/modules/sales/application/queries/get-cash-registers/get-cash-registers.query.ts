export class GetCashRegistersQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
  ) {}
}

