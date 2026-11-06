import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { Request, Response } from 'express';
import { LoginDto } from '../dtos/login.dto';
import { PinLoginDto } from '../dtos/pin-login.dto';
import { LoginCommand } from '../../application/commands/login/login.command';
import { PinLoginCommand } from '../../application/commands/pin-login/pin-login.command';
import { RefreshTokenCommand } from '../../application/commands/refresh/refresh-token.command';
import { LogoutCommand } from '../../application/commands/logout/logout.command';
import { Public } from '../../decorators/public.decorator';
import { WebRequestGuard } from '../../guards/web-request.guard';
import { AuthTokens, AuthTokenService } from '../../services/auth-token.service';
import { clearCookieOptions, readCookie, refreshCookieConfig, refreshCookieOptions } from '../web-session/refresh-cookie';

/** Lo que recibe la web: solo el token de acceso. El refresh token viaja en una cookie `HttpOnly`. */
export interface WebSession {
  accessToken: string;
}

/**
 * Sesión para el navegador. Hace lo mismo que `/auth/*` (mismos comandos, mismos límites de intentos), pero el
 * refresh token nunca llega al JavaScript de la página: se guarda en una cookie que solo el navegador manda.
 * El móvil sigue usando `/auth/*` con tokens en el cuerpo.
 */
@Public()
@UseGuards(WebRequestGuard)
@Controller('auth/web')
export class WebAuthController {
  private readonly cookie = refreshCookieConfig();

  constructor(
    private readonly commandBus: CommandBus,
    private readonly tokens: AuthTokenService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() clientIp: string, @Res({ passthrough: true }) res: Response): Promise<WebSession> {
    const session = await this.commandBus.execute<LoginCommand, AuthTokens>(new LoginCommand(dto.email, dto.password, dto.tenantSlug, clientIp));
    return this.startSession(res, session);
  }

  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  async pinLogin(@Body() dto: PinLoginDto, @Ip() clientIp: string, @Res({ passthrough: true }) res: Response): Promise<WebSession> {
    const session = await this.commandBus.execute<PinLoginCommand, AuthTokens>(new PinLoginCommand(dto.pin, dto.tenantSlug, clientIp));
    return this.startSession(res, session);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<WebSession> {
    const refreshToken = readCookie(req.headers.cookie, this.cookie.name);
    if (!refreshToken) {
      this.clearRefreshCookie(res);
      throw this.tokens.sessionExpired();
    }
    try {
      const session = await this.commandBus.execute<RefreshTokenCommand, AuthTokens>(new RefreshTokenCommand(refreshToken));
      return this.startSession(res, session);
    } catch (error) {
      // Una cookie que ya no sirve se quita: así la página no la reintenta en cada carga
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ message: string }> {
    const refreshToken = readCookie(req.headers.cookie, this.cookie.name);
    if (refreshToken) {
      // Se revoca la sesión con la identidad del refresh token, que sirve aunque el token de acceso ya haya vencido
      const userId = await this.tokens.verifyRefreshToken(refreshToken).catch(() => null);
      if (userId) await this.commandBus.execute(new LogoutCommand(userId));
    }
    this.clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  }

  private startSession(res: Response, session: AuthTokens): WebSession {
    const maxAge = this.tokens.secondsUntilRefreshExpiry(session.refreshToken);
    res.cookie(this.cookie.name, session.refreshToken, refreshCookieOptions(this.cookie, maxAge));
    res.setHeader('Cache-Control', 'no-store');
    return { accessToken: session.accessToken };
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(this.cookie.name, clearCookieOptions(this.cookie));
    res.setHeader('Cache-Control', 'no-store');
  }
}
