import {
  ArgumentsHost,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ApiError } from '@pasta/types';

import { BusinessErrorCode, BusinessException } from '../exceptions/business.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/v1/tours', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;

    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  function caught(exception: unknown): ApiError {
    filter.catch(exception, host);
    return json.mock.calls[0]?.[0] as ApiError;
  }

  it('shapes a standard HTTP exception', () => {
    const body = caught(new NotFoundException('Tour not found'));

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({
      success: false,
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'Tour not found',
      path: '/api/v1/tours',
    });
  });

  it('surfaces the business error code', () => {
    const body = caught(
      new BusinessException(BusinessErrorCode.SlotSoldOut, 'That time slot is sold out.'),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(body).toMatchObject({ error: 'SLOT_SOLD_OUT', message: 'That time slot is sold out.' });
  });

  it('preserves structured field errors from validation', () => {
    const body = caught(
      new UnprocessableEntityException({
        message: 'The submitted data is invalid.',
        errors: [{ field: 'email', message: 'email must be an email' }],
      }),
    );

    expect(body.statusCode).toBe(422);
    expect(body.errors).toEqual([{ field: 'email', message: 'email must be an email' }]);
  });

  it('never leaks details of an unknown failure', () => {
    const body = caught(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('An unexpected error occurred. Please try again.');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });
});
