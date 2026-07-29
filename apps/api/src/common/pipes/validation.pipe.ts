import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import type { ApiFieldError } from '@pasta/types';

/** Flattens nested `ValidationError`s into `field` / `message` pairs. */
function flatten(errors: readonly ValidationError[], parentPath = ''): ApiFieldError[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field: path, message }));
    const nested = error.children?.length ? flatten(error.children, path) : [];
    return [...own, ...nested];
  });
}

/**
 * The global validation pipe.
 *
 * Rejects unknown properties outright and reports failures as a structured
 * `errors[]` array keyed by field path, which the front-end feeds directly into
 * React Hook Form via `ApiClientError.fieldErrors`.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) =>
      new UnprocessableEntityException({
        message: 'The submitted data is invalid.',
        errors: flatten(errors),
      }),
  });
}
