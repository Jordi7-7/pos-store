import { ExecutionContext } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { WebRequestGuard } from './web-request.guard';

const contextWith = (headers: Record<string, string>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

describe('WebRequestGuard', () => {
  const guard = new WebRequestGuard();

  it('deja pasar las llamadas que traen la cabecera de la web', () => {
    expect(guard.canActivate(contextWith({ 'x-requested-with': 'pos-web' }))).toBe(true);
  });

  it('rechaza con 403 FORBIDDEN las que no la traen o traen otro valor', () => {
    const rejected: Array<Record<string, string>> = [{}, { 'x-requested-with': 'XMLHttpRequest' }, { 'x-requested-with': '' }];
    for (const headers of rejected) {
      try {
        guard.canActivate(contextWith(headers));
        throw new Error('debió rechazar');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(403);
      }
    }
  });
});
