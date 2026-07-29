/**
 * Test environment. Loaded before the app boots so the harness never touches
 * the development database, and so `PrismaService.truncateAll` is permitted.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://pasta:pasta@localhost:5432/pasta_roma_tour_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.SWAGGER_ENABLED = 'false';
// Queues and SMTP stay off: mail falls back to the log transport.
delete process.env.REDIS_URL;
delete process.env.SMTP_URL;
// Generous limits so rate limiting never makes a functional test flaky.
process.env.THROTTLE_LIMIT = '10000';
