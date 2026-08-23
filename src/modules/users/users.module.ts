import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { User } from './domain/entities/user.entity';
import { CreateUserHandler } from './application/commands/create-user/create-user.handler';
import { GeneratePinHandler } from './application/commands/generate-pin/generate-pin.handler';
import { UsersController } from './infrastructure/controllers/users.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    CqrsModule,
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [CreateUserHandler, GeneratePinHandler],
  exports: [TypeOrmModule],
})
export class UsersModule {}
