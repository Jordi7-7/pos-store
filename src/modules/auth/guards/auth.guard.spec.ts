import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuthenticatedRequest } from '../interfaces/authenticated-request';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const secret = 'test-secret';
  const jwt = new JwtService({ secret });
  const config = { getOrThrow: () => secret } as unknown as ConfigService;

  const guardFor = (isPublic: boolean) =>
    new AuthGuard(jwt, { getAllAndOverride: () => isPublic } as unknown as Reflector, config);

  const contextWith = (authorization?: string) => {
    const request = { headers: { authorization } } as unknown as AuthenticatedRequest;
    const context = {
      getHandler: () => 'handler',
      getClass: () => 'class',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  const payload = { sub: 'u1', tenantId: 't1', isOwner: false, permissions: ['a'] };

  describe('ruta protegida', () => {
    it('adjunta el contenido del token válido a la petición', async () => {
      const { context, request } = contextWith(`Bearer ${await jwt.signAsync(payload)}`);

      await expect(guardFor(false).canActivate(context)).resolves.toBe(true);
      expect(request.user).toMatchObject({ sub: 'u1', tenantId: 't1' });
    });

    it('sin token responde AUTH_TOKEN_MISSING', async () => {
      await expect(guardFor(false).canActivate(contextWith().context)).rejects.toMatchObject({ code: ErrorCode.AuthTokenMissing });
    });

    it('un esquema distinto de Bearer cuenta como sin token', async () => {
      await expect(guardFor(false).canActivate(contextWith('Basic abc').context)).rejects.toMatchObject({ code: ErrorCode.AuthTokenMissing });
    });

    it('un token expirado responde AUTH_TOKEN_INVALID', async () => {
      const expired = await jwt.signAsync(payload, { expiresIn: -10 });
      await expect(guardFor(false).canActivate(contextWith(`Bearer ${expired}`).context)).rejects.toMatchObject({ code: ErrorCode.AuthTokenInvalid });
    });

    it('un token firmado con otra clave responde AUTH_TOKEN_INVALID', async () => {
      const forged = await new JwtService({ secret: 'otra-clave' }).signAsync(payload);
      await expect(guardFor(false).canActivate(contextWith(`Bearer ${forged}`).context)).rejects.toMatchObject({ code: ErrorCode.AuthTokenInvalid });
    });
  });

  describe('ruta pública', () => {
    it('sin token deja pasar y no define usuario', async () => {
      const { context, request } = contextWith();
      await expect(guardFor(true).canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('lee el usuario de un token expirado (logout con sesión vencida)', async () => {
      const expired = await jwt.signAsync(payload, { expiresIn: -10 });
      const { context, request } = contextWith(`Bearer ${expired}`);

      await expect(guardFor(true).canActivate(context)).resolves.toBe(true);
      expect(request.user).toMatchObject({ sub: 'u1' });
    });

    it('ignora un token falsificado o corrupto sin bloquear', async () => {
      const forged = await new JwtService({ secret: 'otra-clave' }).signAsync(payload);
      for (const token of [forged, 'basura']) {
        const { context, request } = contextWith(`Bearer ${token}`);
        await expect(guardFor(true).canActivate(context)).resolves.toBe(true);
        expect(request.user).toBeUndefined();
      }
    });
  });
});
