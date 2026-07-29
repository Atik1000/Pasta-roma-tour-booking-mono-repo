import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

import { ApiErrorDto, PaginationMetaDto } from '../dto/api-response.dto';

/**
 * Documents a single-resource response wrapped in the success envelope.
 * Without this, Swagger would advertise the bare model and omit the envelope
 * that `TransformInterceptor` adds.
 */
export function ApiEnvelopeResponse<TModel extends Type<unknown>>(
  model: TModel,
  description?: string,
) {
  return applyDecorators(
    ApiExtraModels(model, ApiErrorDto),
    ApiOkResponse({
      description,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: getSchemaPath(model) },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    }),
  );
}

/** Documents a paginated list response wrapped in the success envelope. */
export function ApiPaginatedResponse<TModel extends Type<unknown>>(
  model: TModel,
  description?: string,
) {
  return applyDecorators(
    ApiExtraModels(model, PaginationMetaDto, ApiErrorDto),
    ApiOkResponse({
      description,
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PaginationMetaDto) },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    }),
  );
}
