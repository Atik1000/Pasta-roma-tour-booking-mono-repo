/** Cookie carrying the refresh token. Never readable from JavaScript. */
export const REFRESH_COOKIE = 'prt_refresh';

/** Claims carried by the access token. */
export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  email: string;
  role: string;
  /**
   * Token type guard. Refresh tokens are opaque rather than JWTs, but this
   * still pins the access token to a single purpose.
   */
  typ: 'access';
}

/**
 * Token ids are UUIDs. Checking the shape before querying keeps a malformed
 * token a clean 401 rather than a Postgres cast error surfacing as a 500.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Password rules enforced on reset and change. */
export const PASSWORD_MIN_LENGTH = 10;

/** How long a password-reset link stays valid. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * Parses a duration such as `15m`, `12h`, `30d` or a bare number of seconds.
 * Throws on anything unrecognised — a mistyped TTL must fail at boot, not
 * silently issue tokens that never expire.
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}". Use formats like 900, 15m, 12h or 30d.`);
  }

  const amount = Number.parseInt(match[1] ?? '0', 10);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };
  return amount * (multipliers[match[2] ?? 's'] ?? 1);
}
