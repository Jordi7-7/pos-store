export class GetPurchasesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
    public readonly userId?: string,
    public readonly isOwner?: boolean,
    public readonly startDateStr?: string,
    public readonly endDateStr?: string,
    public readonly supplierId?: string,
    public readonly page: number = 1,
    public readonly limit: number = 10,
  ) {}
}
