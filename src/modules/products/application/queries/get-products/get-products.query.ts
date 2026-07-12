export class GetProductsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly page?: number,
    public readonly limit?: number,
    public readonly search?: string,
  ) {}
}
