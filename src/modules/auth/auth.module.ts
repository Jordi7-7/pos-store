import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { WebAuthController } from './infrastructure/controllers/web-auth.controller';
import { OnboardTenantHandler } from './application/commands/onboard/onboard-tenant.handler';
import { LoginHandler } from './application/commands/login/login.handler';
import { RefreshTokenHandler } from './application/commands/refresh/refresh-token.handler';
import { LogoutHandler } from './application/commands/logout/logout.handler';
import { PinLoginHandler } from './application/commands/pin-login/pin-login.handler';
import { GetProfileHandler } from './application/queries/get-profile/get-profile.handler';
import { AuthTokenService } from './services/auth-token.service';
import { HashService } from './services/hash.service';
import { LoginAttemptsService } from './services/login-attempts.service';
import { OnboardingSecretGuard } from './guards/onboarding-secret.guard';
import { WebRequestGuard } from './guards/web-request.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    CqrsModule,
  ],
  controllers: [AuthController, WebAuthController],
  providers: [
    HashService,
    AuthTokenService,
    LoginAttemptsService,
    OnboardingSecretGuard,
    WebRequestGuard,
    OnboardTenantHandler,
    LoginHandler,
    RefreshTokenHandler,
    LogoutHandler,
    PinLoginHandler,
    GetProfileHandler,
  ],
  exports: [HashService, AuthTokenService, JwtModule, OnboardingSecretGuard],
})
export class AuthModule {}
