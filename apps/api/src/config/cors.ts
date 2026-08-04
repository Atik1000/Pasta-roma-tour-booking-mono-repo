import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Hosts that can only ever be this machine. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/**
 * Reduces a configured entry to the exact string a browser puts in `Origin`.
 *
 * `CORS_ORIGINS` is hand-edited, so entries arrive with trailing slashes and
 * stray paths (`http://localhost:3000/`). A browser never sends either, and the
 * allowlist was compared with `===` — so one trailing slash silently blocked
 * every request from that origin while the config looked correct.
 */
function toOrigin(value: string): string | null {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

/**
 * Whether an origin is this developer's own machine or their local network.
 *
 * Covers loopback under any spelling, the RFC 1918 ranges a phone or a second
 * laptop reaches the dev server on, and the `.local` names mDNS hands out.
 */
export function isLocalOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname;
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.localhost')) return true;

  // 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12 — private IPv4 only.
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const classB = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (classB?.[1] !== undefined) {
    const second = Number(classB[1]);
    return second >= 16 && second <= 31;
  }

  return false;
}

/**
 * Builds the `origin` callback handed to `app.enableCors`.
 *
 * Three things were wrong with comparing `Origin` against the raw list.
 *
 * The allowlist named `localhost` only, so `http://127.0.0.1:3000` — the same
 * server, and what several tools and bookmarks resolve to — was rejected. So
 * was the LAN address Next.js prints next to "Network:" when you open the site
 * on a phone, and so was `localhost:3002`, which is where Next.js lands on its
 * own when 3000 is already taken. Every one of those produced a bare CORS
 * failure in the console with a perfectly correct-looking `.env`.
 *
 * In development the answer is not to keep extending the list: any loopback or
 * private-network origin is by definition a machine the developer controls, so
 * `allowLocalNetwork` accepts them all. Production keeps the strict allowlist —
 * `NODE_ENV=production` turns the relaxation off, and a public host is neither
 * loopback nor RFC 1918 in any case.
 *
 * Rejection returns `false`, never an `Error`. Throwing from this callback is
 * handled as an exception and answers the preflight with 500, which hides the
 * real cause behind a server error; `false` simply omits the header and lets
 * the browser report the CORS failure it actually is.
 */
export function createCorsOriginCheck(
  allowlist: readonly string[],
  allowLocalNetwork: boolean,
): CorsOptions['origin'] {
  const allowed = new Set(
    allowlist.map(toOrigin).filter((value): value is string => value !== null),
  );

  return (origin, callback) => {
    // Same-origin requests, curl, health checks and server-to-server calls send
    // no Origin at all. CORS does not apply to them.
    if (!origin) return callback(null, true);

    const normalised = toOrigin(origin) ?? origin;

    if (allowed.has(normalised)) return callback(null, true);
    if (allowLocalNetwork && isLocalOrigin(normalised)) return callback(null, true);

    return callback(null, false);
  };
}
