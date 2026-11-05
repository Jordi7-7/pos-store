export interface UpdateUserInput {
  name?: string;
  username?: string;
  email?: string;
  password?: string;
  roleId?: string;
  customPermissions?: string[];
  pin?: string;
  isActive?: boolean;
  branchIds?: string[];
}

export class UpdateUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly input: UpdateUserInput,
    public readonly currentUserId: string,
  ) {}
}
