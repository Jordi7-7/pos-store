export class GetProductsByNameQuery {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly page?: number,
    public readonly limit?: number,
    public readonly productType?: string,
    public readonly branchId?: string,
  ) {}
}

