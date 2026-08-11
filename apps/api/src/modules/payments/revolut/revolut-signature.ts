import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Revolut webhook signature verification.
 *
 * This is the authentication for the webhook endpoint. Without it, anyone who
 * learns the URL can post `{"event":"ORDER_COMPLETED","order_id":"…"}` and mark
 * a booking paid, so it is checked before the payload is parsed and before a
 * single row is read.
 *
 * Revolut signs `<version>.<timestamp>.<raw body>` with HMAC-SHA256 and sends
 * the result hex-encoded in `Revolut-Signature`, alongside the timestamp in
 * `Revolut-Request-Timestamp`. The header may carry several entries — during a
 * secret rotation the same payload is signed with each — so any one matching
 * any configured secret is enough.
 *
 * Documented at:
 * https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature
 */

/** How stale a signed timestamp may be. Revolut's own examples use 5 minutes. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

interface SignatureEntry {
  version: string;
  signature: string;
}

/** `v1=abc,v1=def` → two entries. Malformed pieces are dropped, not guessed at. */
export function parseSignatureHeader(header: string | undefined): SignatureEntry[] {
  if (!header) return [];

  return header
    .split(',')
    .map((entry) => {
      const [version, signature] = entry.trim().split('=');
      return version && signature ? { version, signature } : null;
    })
    .filter((entry): entry is SignatureEntry => entry !== null);
}

/**
 * Whether the request was signed recently enough.
 *
 * Rejecting an old timestamp is what stops a captured payload being replayed
 * forever. A timestamp in the future is rejected too — a valid signature can
 * only be produced by Revolut, and Revolut does not sign for later.
 */
export function isTimestampFresh(timestamp: string | undefined, now = Date.now()): boolean {
  const signedAt = Number(timestamp);
  if (!Number.isFinite(signedAt)) return false;

  const age = now - signedAt;
  return age >= 0 && age <= SIGNATURE_TOLERANCE_MS;
}

/** Constant-time comparison of two hex digests of the same length. */
function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(expected, 'hex');

  // `timingSafeEqual` throws on a length mismatch, and a zero-length buffer is
  // what a non-hex signature decodes to.
  if (a.length === 0 || a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function verifySignature({
  header,
  timestamp,
  rawBody,
  secrets,
}: {
  header: string | undefined;
  timestamp: string | undefined;
  rawBody: Buffer;
  secrets: readonly string[];
}): boolean {
  const entries = parseSignatureHeader(header);
  if (entries.length === 0 || secrets.length === 0 || !timestamp) return false;

  return entries.some(({ version, signature }) =>
    secrets.some((secret) => {
      const payload = `${version}.${timestamp}.${rawBody.toString('utf8')}`;
      const expected = createHmac('sha256', secret).update(payload).digest('hex');

      return matches(signature, expected);
    }),
  );
}
