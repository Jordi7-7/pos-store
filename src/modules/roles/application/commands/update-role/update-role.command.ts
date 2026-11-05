export class UpdateRoleCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly name: string | undefined,
    public readonly description: string | undefined,
    public readonly permissions: string[] | undefined,
    public readonly currentUserId: string,
  ) {}
}
