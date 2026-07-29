import { z } from 'zod';

/**
 * An unset variable and a variable set to the empty string mean the same thing.
 * `.env` files routinely contain `STRIPE_SECRET_KEY=` placeholders, and those
 * must not fail validation.
 */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

/**
 * Every environment variable the API reads, validated once at bootstrap.
 * Consumed through the namespaced factories in `configuration.ts`.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('api/v1'),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  /** Public site and admin panel origins, used to build links inside emails. */
  SITE_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),

  DATABASE_URL: optional(z.string().url()),
  REDIS_URL: optional(z.string().url()),

  JWT_ACCESS_SECRET: optional(z.string().min(32)),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: optional(z.string().min(32)),
  JWT_REFRESH_TTL: z.string().default('30d'),

  STRIPE_SECRET_KEY: optional(z.string()),
  STRIPE_WEBHOOK_SECRET: optional(z.string()),

  SMTP_URL: optional(z.string()),
  MAIL_FROM: z.string().default('Pasta Roma Tour <no-reply@pastaromatour.com>'),

  THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

/**
 * Values that are optional in development but mandatory in production.
 * Catching these at boot prevents an instance from starting in a state where
 * logins would fail or data would be lost.
 */
export const productionEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;

  const required: (keyof typeof env)[] = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  for (const key of required) {
    if (!env[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when NODE_ENV=production.`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** `ConfigModule`'s `validate` hook. Throws with every problem listed at once. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = productionEnvSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
