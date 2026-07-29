import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the connection URL out of `schema.prisma` and into this file.
 * The schema now declares only the provider; the URL is supplied here for the
 * CLI (migrate, db push, studio) and by a driver adapter at runtime — see
 * `src/database/prisma.service.ts`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
    // Only used by `migrate dev` and `migrate diff --from-migrations`, which
    // replay the migration history into a throwaway database to detect drift.
    // Never touched by `migrate deploy` or by the running application.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
