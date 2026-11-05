import { EntityManager } from 'typeorm';
import { ErrorCode } from '../errors/error-codes';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const query = jest.fn();
  const controller = new HealthController({ query } as unknown as EntityManager);

  it('responde ok cuando la base de datos contesta', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
  });

  it('responde 503 SERVICE_UNAVAILABLE cuando la base de datos no contesta, sin filtrar el detalle', async () => {
    query.mockRejectedValue(new Error('password authentication failed for user "postgres"'));

    const failure = await controller.check().catch((error: { code: string; status: number; message: string }) => error);

    expect(failure).toMatchObject({ code: ErrorCode.ServiceUnavailable, status: 503 });
    expect(JSON.stringify(failure)).not.toContain('password');
  });
});
