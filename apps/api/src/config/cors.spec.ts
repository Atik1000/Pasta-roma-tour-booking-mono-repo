import { createCorsOriginCheck, isLocalOrigin } from './cors';

/** Runs the express-style callback and returns whether the origin was allowed. */
function check(
  origin: string | undefined,
  allowlist: string[],
  allowLocalNetwork: boolean,
): boolean {
  const fn = createCorsOriginCheck(allowlist, allowLocalNetwork);
  let allowed: boolean | undefined;
  let error: Error | null = null;

  // The signature is the express `cors` origin callback.
  (fn as (o: string | undefined, cb: (e: Error | null, a?: boolean) => void) => void)(
    origin,
    (e, a) => {
      error = e;
      allowed = a;
    },
  );

  // Rejection must never surface as an error — that answers preflight with 500.
  expect(error).toBeNull();
  return allowed === true;
}

const DEV_ALLOWLIST = ['http://localhost:3000', 'http://localhost:3001'];

describe('isLocalOrigin', () => {
  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3001',
    'http://[::1]:3000',
    'http://192.168.68.63:3000',
    'http://10.1.2.3:3001',
    'http://172.16.0.5:3000',
    'http://172.31.255.254:3000',
    'http://macbook.local:3000',
  ])('accepts %s', (origin) => {
    expect(isLocalOrigin(origin)).toBe(true);
  });

  it.each([
    'https://pastaromatour.com',
    'http://172.15.0.1:3000', // just below the private 172.16/12 range
    'http://172.32.0.1:3000', // just above it
    'http://8.8.8.8',
    'http://evil-localhost.com',
    'file://',
    'not a url',
  ])('rejects %s', (origin) => {
    expect(isLocalOrigin(origin)).toBe(false);
  });
});

describe('createCorsOriginCheck', () => {
  it('allows requests that carry no Origin header', () => {
    // curl, health checks and server-to-server calls — CORS does not apply.
    expect(check(undefined, DEV_ALLOWLIST, false)).toBe(true);
  });

  it('allows the configured origins', () => {
    expect(check('http://localhost:3001', DEV_ALLOWLIST, false)).toBe(true);
  });

  it('ignores a trailing slash in the configured value', () => {
    expect(check('http://localhost:3000', ['http://localhost:3000/'], false)).toBe(true);
  });

  it('skips entries that are not URLs instead of throwing', () => {
    expect(check('http://localhost:3000', ['', 'nonsense', 'http://localhost:3000'], false)).toBe(
      true,
    );
  });

  describe('in development', () => {
    it.each([
      ['127.0.0.1 rather than localhost', 'http://127.0.0.1:3001'],
      ['the port Next.js drifts to when 3000 is taken', 'http://localhost:3002'],
      ['the LAN address a phone uses', 'http://192.168.68.63:3000'],
    ])('allows %s', (_label, origin) => {
      expect(check(origin, DEV_ALLOWLIST, true)).toBe(true);
    });

    it('still rejects a public origin', () => {
      expect(check('https://evil.example.com', DEV_ALLOWLIST, true)).toBe(false);
    });
  });

  describe('in production', () => {
    const PROD_ALLOWLIST = ['https://pastaromatour.com'];

    it('allows only the allowlist', () => {
      expect(check('https://pastaromatour.com', PROD_ALLOWLIST, false)).toBe(true);
    });

    it('rejects local origins', () => {
      expect(check('http://localhost:3000', PROD_ALLOWLIST, false)).toBe(false);
      expect(check('http://192.168.68.63:3000', PROD_ALLOWLIST, false)).toBe(false);
    });

    it('rejects a different scheme on an allowed host', () => {
      expect(check('http://pastaromatour.com', PROD_ALLOWLIST, false)).toBe(false);
    });
  });
});
