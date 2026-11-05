import { Controller, Get, Post, Put, Delete, Body, Param, Header, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AuthGuard } from '../../../auth/guards/auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { RequireAnyPermissions, RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS, PERMISSION_DEFINITIONS, PERMISSION_MODULES } from '../../../../common/enums/permissions.enum';
import { CreateRoleDto, UpdateRoleDto } from '../dtos/role.dto';
import { CreateRoleCommand } from '../../application/commands/create-role/create-role.command';
import { UpdateRoleCommand } from '../../application/commands/update-role/update-role.command';
import { DeleteRoleCommand } from '../../application/commands/delete-role/delete-role.command';
import { Role } from '../../domain/entities/role.entity';
import { DeleteRoleResult } from '../../application/commands/delete-role/delete-role.handler';
import { ListRolesQuery } from '../../application/queries/list-roles/list-roles.query';
import { RoleWithUserCount } from '../../application/queries/list-roles/list-roles.handler';

@Controller('roles')
@UseGuards(AuthGuard, PermissionsGuard)
export class RolesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('permissions-catalog')
  @RequireAnyPermissions(APP_PERMISSIONS.ROLES_GET, APP_PERMISSIONS.ROLES_CREATE, APP_PERMISSIONS.ROLES_EDIT)
  @Header('Cache-Control', 'public, max-age=1800')
  getPermissionsCatalog() {
    return { modules: PERMISSION_MODULES, permissions: PERMISSION_DEFINITIONS };
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.ROLES_GET)
  async listRoles(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute<ListRolesQuery, RoleWithUserCount[]>(new ListRolesQuery(tenantId));
  }

  @Post()
  @RequirePermissions(APP_PERMISSIONS.ROLES_CREATE)
  async createRole(@CurrentUser('tenantId') tenantId: string, @CurrentUser('sub') currentUserId: string, @Body() dto: CreateRoleDto) {
    return this.commandBus.execute<CreateRoleCommand, Role>(new CreateRoleCommand(tenantId, dto.name, dto.description, dto.permissions ?? [], currentUserId));
  }

  @Put(':id')
  @RequirePermissions(APP_PERMISSIONS.ROLES_EDIT)
  async updateRole(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') currentUserId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.commandBus.execute<UpdateRoleCommand, Role>(new UpdateRoleCommand(tenantId, id, dto.name, dto.description, dto.permissions, currentUserId));
  }

  @Delete(':id')
  @RequirePermissions(APP_PERMISSIONS.ROLES_DELETE)
  async deleteRole(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.commandBus.execute<DeleteRoleCommand, DeleteRoleResult>(new DeleteRoleCommand(tenantId, id));
  }
}
