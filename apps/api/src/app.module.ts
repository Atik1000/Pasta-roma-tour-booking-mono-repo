import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingModule } from './common/logging/logging.module';
import { appConfig, configurations, throttleConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { validateEnv } from './config/env.validation';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BlogModule } from './modules/blog/blog.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { HealthModule } from './modules/health/health.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { LocationsModule } from './modules/locations/locations.module';
import { MailModule } from './modules/mail/mail.module';
import { ToursModule } from './modules/tours/tours.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { QueueModule } from './queues/queue.module';

/**
 * Root module.
 *
 * Owns configuration, logging, rate limiting, queues, mail, and the two global
 * providers that give every endpoint a consistent response shape. Feature
 * modules — auth, tours, availability, cart, checkout, bookings, payments,
 * blogs, uploads — are registered from Phase 4 onwards.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configurations,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    LoggingModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY, appConfig.KEY],
      useFactory: (
        throttle: ConfigType<typeof throttleConfig>,
        app: ConfigType<typeof appConfig>,
      ) => ({
        throttlers: [{ ttl: throttle.ttlSeconds * 1000, limit: throttle.limit }],
        // Per-route `@Throttle` decorators override the global limit, so tests
        // that legitimately hammer one endpoint cannot be tuned away with env
        // alone. `skipIf` disables the guard wholesale; rate limiting keeps its
        // own dedicated test.
        skipIf: () => app.isTest,
      }),
    }),
    ScheduleModule.forRoot(),
    QueueModule.forRoot(),
    MailModule,
    AuthModule,
    HealthModule,
    MaintenanceModule,
    ToursModule,
    LocationsModule,
    BlogModule,
    AdminModule,
    BookingsModule,
    CartModule,
    CheckoutModule,
    UploadsModule,
    DocumentsModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
