import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiSuccess, PaginationMeta } from '@pasta/types';
import { map, type Observable } from 'rxjs';

import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

/** A handler may return this shape to attach pagination metadata to the envelope. */
export interface PaginatedPayload<T> {
  data: T[];
  meta: PaginationMeta;
}

function isPaginated<T>(value: unknown): value is PaginatedPayload<T> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.data) && typeof candidate.meta === 'object' && candidate.meta !== null
  );
}

/**
 * Wraps every successful response in the `{ success, data, meta, timestamp }`
 * envelope declared by `@pasta/types` and unwrapped by `@pasta/api-client`.
 *
 * Handlers returning `{ data, meta }` have their pagination metadata lifted to
 * the envelope's `meta` field; everything else is placed in `data` untouched.
 * Handlers marked `@RawResponse()` — and any file stream — pass through as-is.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccess<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T> | T> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isRaw) {
      return next.handle();
    }

    return next.handle().pipe(
      map((payload): ApiSuccess<T> | T => {
        if (payload instanceof StreamableFile) {
          return payload;
        }

        const timestamp = new Date().toISOString();

        if (isPaginated(payload)) {
          return {
            success: true,
            data: payload.data as T,
            meta: payload.meta,
            timestamp,
          };
        }

        return { success: true, data: payload, timestamp };
      }),
    );
  }
}
