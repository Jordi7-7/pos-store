import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorBody } from './api-error-body';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

interface Captured {
  status?: number;
  body?: ApiErrorBody;
  headers: Record<string, string>;
}

function run(exception: unknown, requestHeaders: Record<string, string> = {}): Captured {
  const captured: Captured = { headers: {} };
  const response = {
    setHeader: (k: string, v: string) => {
      captured.headers[k] = v;
    },
    status: (s: number) => {
      captured.status = s;
      return { json: (b: ApiErrorBody) => (captured.body = b) };
    },
  };
  const request = { headers: requestHeaders, method: 'POST', originalUrl: '/sales' };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  it('mapea excepciones estándar de Nest a un código estable', () => {
    const { status, body } = run(new NotFoundException('Rol no encontrado.'));

    expect(status).toBe(404);
    expect(body).toMatchObject({
      statusCode: 404,
      code: ErrorCode.NotFound,
      message: 'Rol no encontrado.',
      path: '/sales',
    });
  });

  it('usa el código propio de AppException y conserva details', () => {
    const { status, body } = run(
      new AppException('INSUFFICIENT_STOCK', 'Stock insuficiente.', HttpStatus.CONFLICT, { sku: 'A1' }),
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'INSUFFICIENT_STOCK', message: 'Stock insuficiente.', details: { sku: 'A1' } });
  });

  it('convierte errores de class-validator en VALIDATION_FAILED con message como texto', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: ['quantity must be a positive number', 'sku must be a string'],
    });

    const { body } = run(exception);

    expect(body?.code).toBe(ErrorCode.ValidationFailed);
    expect(typeof body?.message).toBe('string');
    expect(body?.message).toContain('quantity must be a positive number');
    expect(body?.details).toEqual(['quantity must be a positive number', 'sku must be a string']);
  });

  it('no filtra detalles internos en errores no controlados', () => {
    const { status, body } = run(new Error('password=hunter2 connection refused'));

    expect(status).toBe(500);
    expect(body?.code).toBe(ErrorCode.Internal);
    expect(body?.message).toBe('Error interno del servidor.');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('propaga x-request-id si viene en la petición y lo devuelve en la cabecera', () => {
    const { body, headers } = run(new ForbiddenException(), { 'x-request-id': 'req-123' });

    expect(body?.requestId).toBe('req-123');
    expect(headers['x-request-id']).toBe('req-123');
  });

  it('genera un requestId cuando no viene en la petición', () => {
    const { body } = run(new BadRequestException('x'));

    expect(body?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
