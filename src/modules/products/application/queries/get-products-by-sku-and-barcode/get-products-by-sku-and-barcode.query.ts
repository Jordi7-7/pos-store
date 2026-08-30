export class GetProductsBySkuAndBarcodeQuery {
  constructor(
    public readonly tenantId: string,
    public readonly code: string,
    public readonly page?: number,
    public readonly limit?: number,
  ) {}
}
