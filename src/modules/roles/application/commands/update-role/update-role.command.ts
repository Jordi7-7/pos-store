export class UpdateRoleCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly name?: string,
    public readonly description?: string,
    public readonly permissions?: string[],
  ) {}
}
