import { Controller, Post, Put, Body, Param, Get } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateUserDto } from '../dtos/create-user.dto';
import { CreateUserCommand } from '../../application/commands/create-user/create-user.command';
import { UpdateUserDto } from '../dtos/update-user.dto';
import { UpdateUserCommand } from '../../application/commands/update-user/update-user.command';
import { GeneratePinCommand } from '../../application/commands/generate-pin/generate-pin.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { ListUsersQuery } from '../../application/queries/list-users/list-users.query';
import { UserListItem } from '../../application/queries/list-users/list-users.handler';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @RequirePermissions(APP_PERMISSIONS.USERS_CREATE)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.commandBus.execute(
      new CreateUserCommand(
        tenantId,
        dto.name,
        dto.username,
        dto.password,
        dto.email,
        dto.pin,
        dto.roleId,
        dto.customPermissions,
        dto.branchIds,
      ),
    );
  }

  @Put(':id')
  @RequirePermissions(APP_PERMISSIONS.USERS_EDIT)
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') currentUserId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.commandBus.execute(
      new UpdateUserCommand(tenantId, userId, dto, currentUserId),
    );
  }

  @Post(':id/generate-pin')
  @RequirePermissions(APP_PERMISSIONS.USERS_EDIT)
  async generatePin(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.commandBus.execute(
      new GeneratePinCommand(tenantId, targetUserId),
    );
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.USERS_GET)
  async list(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute<ListUsersQuery, UserListItem[]>(new ListUsersQuery(tenantId));
  }
}
