export class DeleteRoleCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
  ) {}
}
