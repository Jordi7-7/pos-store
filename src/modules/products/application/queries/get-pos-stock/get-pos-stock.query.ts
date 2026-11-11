export class GetPosStockQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly userId: string,
    public readonly isOwner: boolean,
    /** Cursor de la descarga anterior; sin él se bajan todas las existencias de la sucursal. */
    public readonly after?: string,
    public readonly limit?: number,
  ) {}
}
