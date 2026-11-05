export class CreateRoleCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly description: string | undefined,
    public readonly permissions: string[],
  ) {}
}
