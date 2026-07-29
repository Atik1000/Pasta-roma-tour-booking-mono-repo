import 'reflect-metadata';

import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { buildValidationPipe } from './common/pipes/validation.pipe';
import { appConfig } from './config/configuration';

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
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-request-id'],
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

  await app.listen(config.port, '0.0.0.0');
  app.get(PinoLogger).log(`API listening on http://localhost:${config.port}/${config.prefix}`);
}

void bootstrap();
