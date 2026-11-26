export class GetDashboardMetricsQuery {
  constructor(
    public readonly tenantId: string,
    /** Quien consulta: define qué sucursales puede ver. */
    public readonly userId: string,
    public readonly isOwner: boolean,
    public readonly branchId?: string,
  ) {}
}
