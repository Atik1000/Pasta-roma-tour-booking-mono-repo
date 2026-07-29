import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';

import { appConfig } from '../../config/configuration';

/**
 * Structured request logging.
 *
 * Every log line carries a request id (echoed back as `x-request-id`), so a
 * client-reported failure can be traced to a single request. Credentials and
 * tokens are redacted before anything reaches the transport.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (app: ConfigType<typeof appConfig>) => ({
        pinoHttp: {
          level: app.isProduction ? 'info' : app.isTest ? 'silent' : 'debug',
          // Pretty output is a development convenience only; production emits NDJSON.
          transport: app.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } },
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const existing = req.headers['x-request-id'];
            const id = typeof existing === 'string' && existing ? existing : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.newPassword',
              'req.body.currentPassword',
              'req.body.token',
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
          autoLogging: {
            // Liveness probes would otherwise dominate the log volume.
            ignore: (req: IncomingMessage) => req.url?.endsWith('/health') === true,
          },
          customLogLevel: (_req, res, error) => {
            if (error ?? res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
