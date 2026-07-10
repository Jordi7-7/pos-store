import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Branch } from './domain/entities/branch.entity';
import { GetBranchesHandler } from './application/queries/get-branches/get-branches.handler';
import { BranchesController } from './infrastructure/controllers/branches.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Branch]),
    CqrsModule,
  ],
  controllers: [BranchesController],
  providers: [GetBranchesHandler],
})
export class BranchesModule {}
