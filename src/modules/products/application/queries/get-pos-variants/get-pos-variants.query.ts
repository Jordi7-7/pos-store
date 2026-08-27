export class GetPosVariantsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
  ) {}
}
