
export class CreateUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly username: string,
    public readonly password: string,
    public readonly email?: string,
    public readonly pin?: string,
    public readonly roleId?: string,
    public readonly customPermissions?: string[],
    public readonly branchIds?: string[],
  ) {}
}
