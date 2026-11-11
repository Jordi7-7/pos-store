export class GetPosCatalogQuery {
  constructor(
    public readonly tenantId: string,
    /** Cursor de la descarga anterior; sin él se baja el catálogo completo. */
    public readonly after?: string,
    public readonly limit?: number,
  ) {}
}
