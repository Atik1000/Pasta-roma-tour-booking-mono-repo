import type { ApiFieldError } from '@pasta/types';

/**
 * Normalised transport error. Every rejection surfaced by the SDK is an
 * instance of this class, so callers never have to inspect Axios internals.
 */
export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly errors: ApiFieldError[];
  readonly path?: string;
  readonly isNetworkError: boolean;

  constructor(options: {
    message: string;
    statusCode: number;
    errors?: ApiFieldError[];
    path?: string;
    isNetworkError?: boolean;
  }) {
    super(options.message);
    this.name = 'ApiClientError';
    this.statusCode = options.statusCode;
    this.errors = options.errors ?? [];
    this.path = options.path;
    this.isNetworkError = options.isNetworkError ?? false;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isValidationError(): boolean {
    return this.statusCode === 422 || (this.statusCode === 400 && this.errors.length > 0);
  }

  /** Field-keyed messages, ready to hand to React Hook Form's `setError`. */
  get fieldErrors(): Record<string, string> {
    return this.errors.reduce<Record<string, string>>((accumulator, error) => {
      accumulator[error.field] = error.message;
      return accumulator;
    }, {});
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}
