import { UserRole } from '../../../enums/user-role.enum';

export class CreateUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly password: string,
    public readonly role: UserRole,
  ) {}
}
