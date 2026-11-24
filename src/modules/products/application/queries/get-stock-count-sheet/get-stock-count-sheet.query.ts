export class GetStockCountSheetQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | undefined,
    public readonly isOwner: boolean | undefined,
    public readonly branchId: string,
    public readonly filters: {
      categoryId?: string;
      /** Solo variantes con existencia distinta de 0 (los saldos negativos también hay que contarlos). */
      onlyWithStock?: boolean;
      /** SKU de la última fila de la página anterior. */
      after?: string;
      limit: number;
    },
  ) {}
}
