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
    /**
     * Browser origins allowed to call this API.
     *
     * `SITE_URL` and `ADMIN_URL` are folded in unconditionally. They already
     * name the two front-ends by definition, and leaving them out meant a
     * deployment that moved to a real domain had to remember to update two
     * variables instead of one — forgetting the second is a whole site that
     * loads and then fails every request with a CORS error.
     */
    corsOrigins: [...parsed.CORS_ORIGINS.split(','), parsed.SITE_URL, parsed.ADMIN_URL]
      .map((origin) => origin.trim())
      .filter(Boolean),
    siteUrl: parsed.SITE_URL,
    adminUrl: parsed.ADMIN_URL,

    /**
     * The origin uploaded images are served from.
     *
     * Two things were wrong here, and together they made every uploaded image
     * load as a broken image while the upload itself reported success.
     *
     * The deployment writes `PUBLIC_API_URL` — bootstrap.sh, the compose file
     * and .env.production.example all use that spelling — but this config read
     * `API_PUBLIC_URL`, which nothing ever set. So it fell through to the
     * localhost default and every image URL pointed at the *visitor's* machine.
     *
     * And `PUBLIC_API_URL` carries the API prefix, while static uploads are
     * mounted outside it (`useStaticAssets` ignores `setGlobalPrefix`, so the
     * files live at `/uploads`, not `/api/v1/uploads`). Taking the origin drops
     * the prefix and leaves exactly the scheme, host and port the browser needs.
     */
    apiPublicUrl: new URL(parsed.PUBLIC_API_URL ?? parsed.API_PUBLIC_URL).origin,
    swaggerEnabled: parsed.SWAGGER_ENABLED,

    /**
     * Whether this deployment is actually reached over TLS.
     *
     * Derived from the configured public URLs rather than from NODE_ENV. A
     * `Secure` cookie is never sent back over plain `http://`, so keying it to
     * "is production" silently breaks the session on any production host that
     * has not had a certificate put in front of it yet — you log in, and the
     * next request arrives with no refresh cookie at all.
     *
     * Reading the scheme instead makes it self-correcting: put nginx and a
     * certificate in front, change these URLs to https, and cookies become
     * Secure again with no code change.
     */
    isHttps: parsed.ADMIN_URL.startsWith('https://') && parsed.SITE_URL.startsWith('https://'),
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
    // Safe to hand to the browser — it identifies the account and can only
    // create tokens, never move money.
    publishableKey: parsed.STRIPE_PUBLISHABLE_KEY,
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
