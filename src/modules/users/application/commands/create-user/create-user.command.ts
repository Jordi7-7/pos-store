
export class CreateUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly username: string,
    public readonly password: string,
    public readonly email: string | undefined,
    public readonly pin: string | undefined,
    public readonly roleId: string | undefined,
    public readonly customPermissions: string[] | undefined,
    public readonly branchIds: string[] | undefined,
    public readonly currentUserId: string,
  ) {}
}
