import { z } from 'zod';

/** Browser-visible configuration for the admin panel. */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api/v1'),
  NEXT_PUBLIC_ADMIN_URL: z.string().url().default('http://localhost:3001'),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map(
    (issue) => `  • ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid public environment variables:\n${issues.join('\n')}`);
}

export const env = parsed.data;
