import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CreateUserDto } from '../../application/commands/create-user/create-user.dto';
import { CreateUserCommand } from '../../application/commands/create-user/create-user.command';
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
      ),
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
    const userRepo = this.entityManager.getRepository(User);
    return userRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }
}
