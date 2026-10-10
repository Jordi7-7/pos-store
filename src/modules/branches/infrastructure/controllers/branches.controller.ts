import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetBranchesQuery } from '../../application/queries/get-branches/get-branches.query';
import { CreateBranchDto } from '../../application/commands/create-branch/create-branch.dto';
import { CreateBranchCommand } from '../../application/commands/create-branch/create-branch.command';
import { UpdateBranchDto } from '../../application/commands/update-branch/update-branch.dto';
import { UpdateBranchCommand } from '../../application/commands/update-branch/update-branch.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';

@Controller('branches')
export class BranchesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  async findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetBranchesQuery(tenantId));
  }

  @Post()
  @RequirePermissions(APP_PERMISSIONS.BRANCHES_MANAGE)
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.commandBus.execute(
      new CreateBranchCommand(tenantId, dto.name, dto.address, dto.isActive),
    );
  }

  @Put(':id')
  @RequirePermissions(APP_PERMISSIONS.BRANCHES_MANAGE)
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.commandBus.execute(
      new UpdateBranchCommand(tenantId, id, dto.name, dto.address, dto.isActive),
    );
  }
}
