import { UpdateUserDto } from './update-user.dto';

export class UpdateUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly dto: UpdateUserDto,
  ) {}
}
