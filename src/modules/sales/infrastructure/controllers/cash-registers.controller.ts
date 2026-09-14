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
  @RequireAnyPermissions(APP_PERMISSIONS.VIEW_POS, APP_PERMISSIONS.VIEW_CASH_REGISTERS)
  async getMyRegisters(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetMyCashRegistersQuery(tenantId, userId, userRole, branchId),
    );
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_MANAGE)
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(
      new GetCashRegistersQuery(tenantId, branchId),
    );
  }

  @Post()
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_MANAGE)
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
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_MANAGE)
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
  @RequirePermissions(APP_PERMISSIONS.CASH_REGISTERS_MANAGE)
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

