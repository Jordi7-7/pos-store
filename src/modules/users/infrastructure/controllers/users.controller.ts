import { Controller, Post, Put, Body, Param, Get } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateUserDto } from '../../application/commands/create-user/create-user.dto';
import { CreateUserCommand } from '../../application/commands/create-user/create-user.command';
import { UpdateUserDto } from '../../application/commands/update-user/update-user.dto';
import { UpdateUserCommand } from '../../application/commands/update-user/update-user.command';
import { GeneratePinCommand } from '../../application/commands/generate-pin/generate-pin.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '../../enums/user-role.enum';
import { User } from '../../domain/entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly entityManager: EntityManager,
  ) {}

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
        dto.username,
        dto.pin,
      ),
    );
  }

  @Put(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.commandBus.execute(
      new UpdateUserCommand(tenantId, userId, dto),
    );
  }

  @Post(':id/generate-pin')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async generatePin(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') targetUserId: string,
  ) {
    return this.commandBus.execute(
      new GeneratePinCommand(tenantId, targetUserId),
    );
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async list(@CurrentUser('tenantId') tenantId: string) {
    const rawUsers = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('CASE WHEN user.pin IS NOT NULL AND user.pin != \'\' THEN true ELSE false END', 'hasPin')
      .where('user.tenantId = :tenantId', { tenantId })
      .orderBy('user.createdAt', 'ASC')
      .getRawAndEntities();

    return rawUsers.entities.map((user, idx) => ({
      ...user,
      hasPin: rawUsers.raw[idx]?.hasPin === true || rawUsers.raw[idx]?.hasPin === 'true',
    }));
  }
}
