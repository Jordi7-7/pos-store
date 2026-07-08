import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { OnboardTenantHandler } from './application/commands/onboard/onboard-tenant.handler';
import { LoginHandler } from './application/commands/login/login.handler';
import { RefreshTokenHandler } from './application/commands/refresh/refresh-token.handler';
import { LogoutHandler } from './application/commands/logout/logout.handler';
import { HashService } from './services/hash.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'fallback_secret',
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    CqrsModule,
  ],
  controllers: [AuthController],
  providers: [
    HashService,
    OnboardTenantHandler,
    LoginHandler,
    RefreshTokenHandler,
    LogoutHandler,
  ],
  exports: [HashService, JwtModule],
})
export class AuthModule {}
