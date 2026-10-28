import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions, RequireAnyPermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { IsString, IsNotEmpty, IsUUID, IsOptional, IsBoolean } from 'class-validator';

import { GetCashRegistersQuery } from '../../application/queries/get-cash-registers/get-cash-registers.query';
import { GetMyCashRegistersQuery } from '../../application/queries/get-my-cash-registers/get-my-cash-registers.query';
import { CreateCashRegisterCommand } from '../../application/commands/create-cash-register/create-cash-register.command';
import { UpdateCashRegisterCommand } from '../../application/commands/update-cash-register/update-cash-register.command';
import { AssignUsersToCashRegisterCommand } from '../../application/commands/assign-users-to-cash-register/assign-users-to-cash-register.command';

export class CreateCashRegisterDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateCashRegisterDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class AssignUsersToCashRegisterDto {
  @IsUUID('4', { each: true })
  userIds: string[];
}

@Controller('cash-registers')
export class CashRegistersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('me')
  @RequireAnyPermissions(
    APP_PERMISSIONS.CASH_REGISTERS_GET,
    APP_PERMISSIONS.POS_SELL,
    APP_PERMISSIONS.CASH_OPEN_CLOSE,
  )
  async getMyRegisters(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetMyCashRegistersQuery(tenantId, userId, isOwner, branchId),
    );
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_GET)
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetCashRegistersQuery(tenantId, branchId),
    );
  }

  @Post()
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_CREATE)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCashRegisterDto,
  ) {
    return this.commandBus.execute(
      new CreateCashRegisterCommand(
        tenantId,
        dto.branchId,
        dto.name,
      ),
    );
  }

  @Put(':id')
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_EDIT)
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCashRegisterDto,
  ) {
    return this.commandBus.execute(
      new UpdateCashRegisterCommand(
        tenantId,
        id,
        dto.name,
        dto.isActive,
      ),
    );
  }

  @Put(':id/assign-users')
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_ASSIGN_USERS)
  async assignUsers(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignUsersToCashRegisterDto,
  ) {
    return this.commandBus.execute(
      new AssignUsersToCashRegisterCommand(
        tenantId,
        id,
        dto.userIds,
      ),
    );
  }
}

