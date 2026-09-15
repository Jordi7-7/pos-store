import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { method, originalUrl, ip } = req;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          const statusText = this.colorizeStatus(statusCode);
          this.logger.log(
            `${method} ${originalUrl} ${statusText} +${duration}ms`
          );
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const statusCode = err.status || err.statusCode || 500;
          const statusText = `\x1b[31m${statusCode}\x1b[0m`;
          const message = err.message || 'Internal server error';
          this.logger.error(
            `${method} ${originalUrl} ${statusText} +${duration}ms - Error: ${message}`
          );
        },
      }),
    );
  }

  private colorizeStatus(code: number): string {
    if (code >= 500) return `\x1b[31m${code}\x1b[0m`; // Red
    if (code >= 400) return `\x1b[33m${code}\x1b[0m`; // Yellow
    if (code >= 300) return `\x1b[36m${code}\x1b[0m`; // Cyan
    if (code >= 200) return `\x1b[32m${code}\x1b[0m`; // Green
    return `${code}`;
  }
}
