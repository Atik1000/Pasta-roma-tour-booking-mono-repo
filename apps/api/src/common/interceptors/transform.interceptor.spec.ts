import { ExecutionContext, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';

import { TransformInterceptor } from './transform.interceptor';

function contextStub(): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('TransformInterceptor', () => {
  const reflector = new Reflector();

  function run<T>(payload: T, isRaw = false) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isRaw);
    const interceptor = new TransformInterceptor<T>(reflector);
    return firstValueFrom(interceptor.intercept(contextStub(), { handle: () => of(payload) }));
  }

  it('wraps a plain payload in the success envelope', async () => {
    const result = await run({ id: 'tour-1' });

    expect(result).toMatchObject({ success: true, data: { id: 'tour-1' } });
    expect(result).toHaveProperty('timestamp');
    expect(result).not.toHaveProperty('meta');
  });

  it('lifts pagination metadata out of the payload', async () => {
    const meta = {
      page: 1,
      limit: 6,
      total: 24,
      totalPages: 4,
      hasNextPage: true,
      hasPreviousPage: false,
    };

    const result = await run({ data: [{ id: 'tour-1' }], meta });

    expect(result).toMatchObject({ success: true, data: [{ id: 'tour-1' }], meta });
  });

  it('leaves an empty array as data rather than treating it as paginated', async () => {
    const result = await run([]);

    expect(result).toMatchObject({ success: true, data: [] });
  });

  it('passes file streams through untouched', async () => {
    const file = new StreamableFile(Buffer.from('%PDF-1.4'));

    await expect(run(file)).resolves.toBe(file);
  });

  it('passes handlers marked @RawResponse through untouched', async () => {
    await expect(run({ received: true }, true)).resolves.toEqual({ received: true });
  });
});
