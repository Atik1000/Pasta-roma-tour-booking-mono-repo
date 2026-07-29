import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AllExceptionsFilter } from './filters/all-exceptions.filter';

@Controller('ping')
class PingController {
  @Get()
  ping(): { pong: true } {
    return { pong: true };
  }
}

/**
 * Integration cover for the two global providers that every future endpoint
 * inherits: the throttler guard and the exception filter that shapes its 429.
 */
describe('Global rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 3 }] })],
      controllers: [PingController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows requests up to the configured limit, then rejects with a shaped 429', async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await request(app.getHttpServer()).get('/ping').expect(200);
    }

    const blocked = await request(app.getHttpServer()).get('/ping').expect(429);

    expect(blocked.body).toMatchObject({
      success: false,
      statusCode: 429,
      path: '/ping',
    });
    expect(blocked.body.message).toBeDefined();
  });
});
