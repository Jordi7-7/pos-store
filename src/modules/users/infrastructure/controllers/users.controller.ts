import { Controller, Post, Body } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CreateUserDto } from '../../application/commands/create-user/create-user.dto';
import { CreateUserCommand } from '../../application/commands/create-user/create-user.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '../../enums/user-role.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.commandBus.execute(
      new CreateUserCommand(
        tenantId,
        dto.name,
        dto.email,
        dto.password,
        dto.role,
      ),
    );
  }
}
