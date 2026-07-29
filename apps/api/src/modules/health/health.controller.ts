import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { ApiEnvelopeResponse } from '../../common/decorators/api-response.decorator';
import { Public } from '../../common/decorators/auth.decorators';
import { appConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { HealthResponseDto, ReadinessResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
@Public()
// Probes run continuously and must never be rate limited.
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe — the process is up' })
  @ApiEnvelopeResponse(HealthResponseDto)
  check(): HealthResponseDto {
    return {
      status: 'ok',
      environment: this.config.nodeEnv,
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — dependencies are reachable' })
  @ApiEnvelopeResponse(ReadinessResponseDto)
  async ready(): Promise<ReadinessResponseDto> {
    const database = await this.prisma.ping();

    if (!database) {
      // A 503 keeps the instance out of the load balancer rotation.
      throw new ServiceUnavailableException('The database is not reachable.');
    }

    return { status: 'ready', database: 'up', timestamp: new Date().toISOString() };
  }
}
