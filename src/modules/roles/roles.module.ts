import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Role } from './domain/entities/role.entity';
import { RolesController } from './infrastructure/controllers/roles.controller';
import { CreateRoleHandler } from './application/commands/create-role/create-role.handler';
import { UpdateRoleHandler } from './application/commands/update-role/update-role.handler';
import { DeleteRoleHandler } from './application/commands/delete-role/delete-role.handler';
import { ListRolesHandler } from './application/queries/list-roles/list-roles.handler';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Role]), CqrsModule, AuthModule],
  controllers: [RolesController],
  providers: [CreateRoleHandler, UpdateRoleHandler, DeleteRoleHandler, ListRolesHandler],
  exports: [TypeOrmModule],
})
export class RolesModule {}
