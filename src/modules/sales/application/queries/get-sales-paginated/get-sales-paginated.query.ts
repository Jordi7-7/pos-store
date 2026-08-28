export class GetSalesPaginatedQuery {
  constructor(
    public readonly tenantId: string,
    public readonly startDateStr?: string,
    public readonly endDateStr?: string,
    public readonly page = 1,
    public readonly limit = 10,
  ) {}
}
