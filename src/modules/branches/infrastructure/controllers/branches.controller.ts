import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetBranchesQuery } from '../../application/queries/get-branches/get-branches.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

@Controller('branches')
export class BranchesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetBranchesQuery(tenantId));
  }
}
