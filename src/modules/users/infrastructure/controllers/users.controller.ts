import { Controller, Post, Put, Body, Param, Get } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateUserDto } from '../../application/commands/create-user/create-user.dto';
import { CreateUserCommand } from '../../application/commands/create-user/create-user.command';
import { UpdateUserDto } from '../../application/commands/update-user/update-user.dto';
import { UpdateUserCommand } from '../../application/commands/update-user/update-user.command';
import { GeneratePinCommand } from '../../application/commands/generate-pin/generate-pin.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { User } from '../../domain/entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly entityManager: EntityManager,
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
    const rawUsers = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleEntity', 'roleEntity')
      .leftJoinAndSelect('user.branches', 'branches')
      .addSelect('CASE WHEN user.pin IS NOT NULL AND user.pin != \'\' THEN true ELSE false END', 'hasPin')
      .where('user.tenantId = :tenantId', { tenantId })
      .orderBy('user.createdAt', 'ASC')
      .getRawAndEntities();

    return rawUsers.entities.map((user, idx) => {
      const role = user.isOwner
        ? { id: 'owner', name: 'Propietario' }
        : user.roleEntity
        ? { id: user.roleEntity.id, name: user.roleEntity.name }
        : null;

      const branches = (user.branches || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        address: b.address || null,
      }));

      return {
        id: user.id,
        name: user.name,
        username: user.username || null,
        email: user.email,
        isOwner: user.isOwner,
        isActive: user.isActive,
        role,
        hasPin: rawUsers.raw[idx]?.hasPin === true || rawUsers.raw[idx]?.hasPin === 'true',
        branches,
        customPermissions: user.customPermissions || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }
}
