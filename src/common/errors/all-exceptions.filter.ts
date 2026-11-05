import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { DomainError } from '../domain/domain.error';
import { ApiErrorBody } from './api-error-body';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

const CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BadRequest,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthorized,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.CONFLICT]: ErrorCode.Conflict,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PayloadTooLarge,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TooManyRequests,
};

interface NormalizedError {
  status: number;
  code: ErrorCode | string;
  message: string;
  details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeHttpException(exception: HttpException): NormalizedError {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const fallbackCode = CODE_BY_STATUS[status] ?? ErrorCode.BadRequest;

  if (exception instanceof AppException) {
    return { status, code: exception.code, message: exception.message, details: exception.details };
  }

  if (isRecord(response) && Array.isArray(response.message)) {
    // class-validator (ValidationPipe): lista de mensajes por campo.
    const messages = response.message.filter((m): m is string => typeof m === 'string');
    return {
      status,
      code: ErrorCode.ValidationFailed,
      message: messages.join('; ') || 'Datos de entrada no válidos.',
      details: messages,
    };
  }

  const message = isRecord(response) && typeof response.message === 'string' ? response.message : exception.message;
  return { status, code: fallbackCode, message };
}

function normalizeDomainError(error: DomainError): NormalizedError {
  return { status: HttpStatus.BAD_REQUEST, code: error.code, message: error.message, details: error.details };
}

function normalize(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) return normalizeHttpException(exception);
  if (exception instanceof DomainError) return normalizeDomainError(exception);
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.InternalError,
    // Nunca filtrar detalles internos al cliente.
    message: 'Error interno del servidor.',
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const requestIdHeader = request.headers['x-request-id'];
    const requestId = typeof requestIdHeader === 'string' && requestIdHeader ? requestIdHeader : randomUUID();

    const normalized = normalize(exception);

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const detail = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      this.logger.error(`[${requestId}] ${request.method} ${request.originalUrl} -> ${detail}`);
    }

    const body: ApiErrorBody = {
      statusCode: normalized.status,
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId,
    };

    response.setHeader('x-request-id', requestId);
    response.status(normalized.status).json(body);
  }
}
