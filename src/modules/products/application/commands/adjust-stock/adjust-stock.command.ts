export class AdjustStockCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly variantId: string,
    public readonly quantity: number,
    public readonly type: 'IN' | 'OUT',
    public readonly comment?: string,
  ) {}
}
