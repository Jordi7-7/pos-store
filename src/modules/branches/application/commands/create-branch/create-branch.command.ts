export class CreateBranchCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly address: string,
    public readonly isActive?: boolean,
  ) {}
}
