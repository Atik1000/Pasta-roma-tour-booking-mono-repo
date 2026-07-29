import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { appConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const ping = jest.fn();

  async function build(): Promise<HealthController> {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: appConfig.KEY, useValue: { nodeEnv: 'test' } },
        { provide: PrismaService, useValue: { ping } },
      ],
    }).compile();

    return moduleRef.get(HealthController);
  }

  beforeEach(() => {
    ping.mockReset();
  });

  it('reports a healthy process', async () => {
    const result = (await build()).check();

    expect(result.status).toBe('ok');
    expect(result.environment).toBe('test');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it('reports ready when the database answers', async () => {
    ping.mockResolvedValue(true);

    await expect((await build()).ready()).resolves.toMatchObject({
      status: 'ready',
      database: 'up',
    });
  });

  it('fails readiness with a 503 when the database is unreachable', async () => {
    ping.mockResolvedValue(false);

    await expect((await build()).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
