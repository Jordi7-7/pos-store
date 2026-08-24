import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantLocalStorage } from './tenant-context';

interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  name: string;
  timezone?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let tenantId: string | undefined;
    let userId: string | undefined;
    let timezone = 'America/Guayaquil';

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = this.decodeJwt(token);
      if (payload) {
        tenantId = payload.tenantId;
        userId = payload.sub;
        timezone = payload.timezone || timezone;
      }
    }

    // If it's a public route or health check, skip tenant context execution entirely.
    if (req.path === '/' || req.path.startsWith('/health')) {
      return next();
    }

    if (!tenantId) {
      throw new UnauthorizedException('Missing tenant_id in request header or JWT');
    }

    tenantLocalStorage.run({ tenantId, userId, timezone }, () => {
      next();
    });
  }

  private decodeJwt(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
        return JSON.parse(payloadJson);
      }
    } catch {
      return null;
    }
    return null;
  }
}
