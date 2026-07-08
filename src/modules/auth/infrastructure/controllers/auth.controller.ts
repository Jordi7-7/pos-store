import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { OnboardTenantDto } from '../../application/commands/onboard/onboard-tenant.dto';
import { OnboardTenantCommand } from '../../application/commands/onboard/onboard-tenant.command';
import { LoginDto } from '../../application/commands/login/login.dto';
import { LoginCommand } from '../../application/commands/login/login.command';
import { RefreshTokenDto } from '../../application/commands/refresh/refresh-token.dto';
import { RefreshTokenCommand } from '../../application/commands/refresh/refresh-token.command';
import { LogoutCommand } from '../../application/commands/logout/logout.command';
import { Public } from '../../decorators/public.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Public()
  @Post('onboard')
  async onboard(@Body() dto: OnboardTenantDto) {
    return this.commandBus.execute(
      new OnboardTenantCommand(
        dto.tenantName,
        dto.ruc,
        dto.country,
        dto.currencyCode,
        dto.currencySymbol,
        dto.adminName,
        dto.email,
        dto.password,
        dto.branchName,
        dto.branchAddress,
      ),
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.commandBus.execute(new LoginCommand(dto.email, dto.password));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.commandBus.execute(new RefreshTokenCommand(dto.refreshToken));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser('sub') userId: string) {
    await this.commandBus.execute(new LogoutCommand(userId));
    return { message: 'Logged out successfully' };
  }
}
