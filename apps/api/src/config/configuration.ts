import { registerAs } from '@nestjs/config';

import { envSchema, type Env } from './env.validation';

/**
 * Namespaced configuration.
 *
 * Every module injects the slice it needs (`ConfigType<typeof appConfig>`)
 * rather than reaching into raw `process.env`, so the shape of the environment
 * is declared exactly once — in `env.validation.ts`.
 */
function env(): Env {
  // `validateEnv` already ran in ConfigModule; re-parsing here applies the same
  // defaults and coercions to the namespaced factories.
  return envSchema.parse(process.env);
}

export const appConfig = registerAs('app', () => {
  const parsed = env();
  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    isTest: parsed.NODE_ENV === 'test',
    port: parsed.PORT,
    prefix: parsed.API_PREFIX,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    siteUrl: parsed.SITE_URL,
    adminUrl: parsed.ADMIN_URL,
    swaggerEnabled: parsed.SWAGGER_ENABLED,
  };
});

export const databaseConfig = registerAs('database', () => ({
  url: env().DATABASE_URL,
}));

export const redisConfig = registerAs('redis', () => {
  const url = env().REDIS_URL;
  return {
    url,
    /** Queues and distributed rate limiting degrade gracefully when unset. */
    enabled: Boolean(url),
  };
});

export const jwtConfig = registerAs('jwt', () => {
  const parsed = env();
  return {
    accessSecret: parsed.JWT_ACCESS_SECRET,
    accessTtl: parsed.JWT_ACCESS_TTL,
    refreshSecret: parsed.JWT_REFRESH_SECRET,
    refreshTtl: parsed.JWT_REFRESH_TTL,
  };
});

export const mailConfig = registerAs('mail', () => {
  const parsed = env();
  return {
    smtpUrl: parsed.SMTP_URL,
    from: parsed.MAIL_FROM,
    /** Without SMTP credentials the mailer logs messages instead of sending. */
    enabled: Boolean(parsed.SMTP_URL),
  };
});

export const stripeConfig = registerAs('stripe', () => {
  const parsed = env();
  return {
    secretKey: parsed.STRIPE_SECRET_KEY,
    webhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    enabled: Boolean(parsed.STRIPE_SECRET_KEY),
  };
});

export const throttleConfig = registerAs('throttle', () => {
  const parsed = env();
  return {
    ttlSeconds: parsed.THROTTLE_TTL_SECONDS,
    limit: parsed.THROTTLE_LIMIT,
  };
});

export const configurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  mailConfig,
  stripeConfig,
  throttleConfig,
];
