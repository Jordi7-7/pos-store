import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantLocalStorage } from './tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let tenantId = req.headers['x-tenant-id'] as string;
    let userId = req.headers['x-user-id'] as string;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = this.decodeJwt(token);
      if (payload) {
        tenantId = tenantId || payload.tenant_id || payload.tenantId;
        userId = userId || payload.user_id || payload.userId || payload.sub;
      }
    }

    // For Phase 1 backend, we want to ensure tenantId is present on operations.
    // If it's a public route or health check, we could skip it.
    // But we will enforce it unless it's a root/health endpoint.
    if (!tenantId && req.path !== '/' && !req.path.startsWith('/health')) {
      throw new UnauthorizedException('Missing tenant_id in request header or JWT');
    }

    tenantLocalStorage.run({ tenantId, userId }, () => {
      next();
    });
  }

  private decodeJwt(token: string): any {
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
