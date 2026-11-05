import { Controller, Post, Body, HttpCode, HttpStatus, Get, Ip, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { OnboardTenantDto } from '../dtos/onboard-tenant.dto';
import { OnboardTenantCommand } from '../../application/commands/onboard/onboard-tenant.command';
import { LoginDto } from '../dtos/login.dto';
import { LoginCommand } from '../../application/commands/login/login.command';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { RefreshTokenCommand } from '../../application/commands/refresh/refresh-token.command';
import { LogoutCommand } from '../../application/commands/logout/logout.command';
import { PinLoginCommand } from '../../application/commands/pin-login/pin-login.command';
import { PinLoginDto } from '../dtos/pin-login.dto';
import { GetProfileQuery } from '../../application/queries/get-profile/get-profile.query';
import { Profile } from '../../application/queries/get-profile/get-profile.handler';
import { Public } from '../../decorators/public.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { OnboardingSecretGuard } from '../../guards/onboarding-secret.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Public()
  @UseGuards(OnboardingSecretGuard)
  @Post('onboard')
  async onboard(@Body() dto: OnboardTenantDto) {
    return this.commandBus.execute(
      new OnboardTenantCommand(
        dto.tenantName,
        dto.ruc,
        dto.country,
        dto.currencyCode,
        dto.currencySymbol,
        dto.timezone,
        dto.adminName,
        dto.username,
        dto.password,
        dto.branchName,
        dto.branchAddress,
        dto.email,
        dto.slug,
      ),
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() clientIp: string) {
    return this.commandBus.execute(new LoginCommand(dto.email, dto.password, dto.tenantSlug, clientIp));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.commandBus.execute(new RefreshTokenCommand(dto.refreshToken));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser('sub') userId?: string) {
    await this.commandBus.execute(new LogoutCommand(userId || null));
    return { message: 'Logged out successfully' };
  }

  @Public()
  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  async pinLogin(@Body() dto: PinLoginDto, @Ip() clientIp: string) {
    return this.commandBus.execute(new PinLoginCommand(dto.pin, dto.tenantSlug, clientIp));
  }

  @Get('profile')
  async getProfile(@CurrentUser('tenantId') tenantId: string, @CurrentUser('sub') userId: string) {
    return this.queryBus.execute<GetProfileQuery, Profile>(new GetProfileQuery(tenantId, userId));
  }
}
