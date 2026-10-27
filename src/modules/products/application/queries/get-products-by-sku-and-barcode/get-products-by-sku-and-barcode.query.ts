export class GetProductsBySkuAndBarcodeQuery {
  constructor(
    public readonly tenantId: string,
    public readonly code: string,
    public readonly page?: number,
    public readonly limit?: number,
    public readonly productType?: string,
    public readonly branchId?: string,
  ) {}
}

