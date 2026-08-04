import 'reflect-metadata';

import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { join } from 'node:path';

import { AppModule } from './app.module';
import { buildValidationPipe } from './common/pipes/validation.pipe';
import { appConfig } from './config/configuration';
import { createCorsOriginCheck } from './config/cors';
import { UPLOAD_DIR, UPLOAD_ROUTE } from './modules/uploads/uploads.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Stripe webhook signature verification needs the unparsed body (Phase 9).
    rawBody: true,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  // The version lives in API_PREFIX (`api/v1`), so Nest's URI versioning is not layered on top.
  app.setGlobalPrefix(config.prefix);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    // Outside production this also accepts loopback and private-network
    // origins, so 127.0.0.1, a drifted port and a phone on the LAN all work
    // without editing CORS_ORIGINS. See config/cors.ts.
    origin: createCorsOriginCheck(config.corsOrigins, !config.isProduction),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-request-id'],
  });

  // Uploaded images. Served with a long cache because filenames are random and
  // therefore immutable; `index: false` stops the directory being listable.
  app.useStaticAssets(join(process.cwd(), UPLOAD_DIR), {
    prefix: UPLOAD_ROUTE,
    index: false,
    maxAge: '30d',
    immutable: true,
  });

  app.useGlobalPipes(buildValidationPipe());
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Pasta Roma Tour API')
        .setDescription('Tours, availability, cart, checkout, bookings, payments and blog content.')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
        .build(),
    );
    SwaggerModule.setup(`${config.prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  /**
   * No explicit host, so Node binds dual-stack.
   *
   * `'0.0.0.0'` is IPv4-only, and both Next.js apps bind dual-stack — so on a
   * machine where `localhost` resolves to `::1` first (macOS, and Chrome in
   * particular), the browser loaded the site fine and then could not open a
   * single connection to `http://localhost:4000`. The request fails before any
   * response exists to carry CORS headers, so the console reports it as a CORS
   * error and the allowlist looks like the culprit when it never ran.
   *
   * Omitting the host makes Node listen on `::` with an automatic fallback to
   * `0.0.0.0` where IPv6 is unavailable — still every interface, which is what
   * the container needs.
   */
  await app.listen(config.port);
  app.get(PinoLogger).log(`API listening on http://localhost:${config.port}/${config.prefix}`);
}

void bootstrap();
