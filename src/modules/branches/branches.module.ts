import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Branch } from './domain/entities/branch.entity';
import { GetBranchesHandler } from './application/queries/get-branches/get-branches.handler';
import { CreateBranchHandler } from './application/commands/create-branch/create-branch.handler';
import { UpdateBranchHandler } from './application/commands/update-branch/update-branch.handler';
import { BranchesController } from './infrastructure/controllers/branches.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Branch]),
    CqrsModule,
  ],
  controllers: [BranchesController],
  providers: [
    GetBranchesHandler,
    CreateBranchHandler,
    UpdateBranchHandler,
  ],
})
export class BranchesModule {}
