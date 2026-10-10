export class UpdateBranchCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly name?: string,
    public readonly address?: string,
    public readonly isActive?: boolean,
  ) {}
}
