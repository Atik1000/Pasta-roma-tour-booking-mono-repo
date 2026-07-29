import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError, ApiFieldError } from '@pasta/types';
import type { Request, Response } from 'express';

import { BusinessException } from '../exceptions/business.exception';

interface NormalizedError {
  statusCode: number;
  /** Machine-readable code: a business code, or the HTTP reason phrase. */
  error: string;
  message: string;
  errors?: ApiFieldError[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function reasonPhrase(status: number): string {
  const name = Object.entries(HttpStatus).find(([, value]) => value === status)?.[0];
  return name ?? 'ERROR';
}

/**
 * Converts every thrown value into the `ApiError` envelope declared by
 * `@pasta/types`. Nothing escapes as an unshaped 500, and internal details
 * never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const normalized = this.normalize(exception);

    if (normalized.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${normalized.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} → ${normalized.statusCode} ${normalized.error}`,
      );
    }

    const body: ApiError = {
      success: false,
      statusCode: normalized.statusCode,
      error: normalized.error,
      message: normalized.message,
      ...(normalized.errors?.length ? { errors: normalized.errors } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(normalized.statusCode).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof BusinessException) {
      return {
        statusCode: exception.getStatus(),
        error: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { statusCode, error: reasonPhrase(statusCode), message: payload };
    }

    if (!isRecord(payload)) {
      return { statusCode, error: reasonPhrase(statusCode), message: exception.message };
    }

    // `message` is a string[] when class-validator's default factory is used.
    const rawMessage = payload.message;
    const message = Array.isArray(rawMessage)
      ? 'The submitted data is invalid.'
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception.message;

    const errors = Array.isArray(payload.errors)
      ? (payload.errors as ApiFieldError[])
      : Array.isArray(rawMessage)
        ? rawMessage.map((entry) => ({ field: '', message: String(entry) }))
        : undefined;

    const code = typeof payload.code === 'string' ? payload.code : reasonPhrase(statusCode);

    return { statusCode, error: code, message, errors };
  }
}
