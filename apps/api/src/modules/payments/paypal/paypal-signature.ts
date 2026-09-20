import type { PayPalWebhookHeaders } from './paypal.client';

/**
 * The half of PayPal webhook authentication that can be settled locally.
 *
 * Unlike Stripe and Revolut, PayPal does not sign with a shared secret: it
 * signs with a certificate and the verdict comes from a call to
 * `verify-webhook-signature`. That call is the authentication, and it lives on
 * the client. What is left here are the two things worth deciding before
 * spending a round trip on a request that cannot possibly be genuine.
 *
 * Reference:
 * https://developer.paypal.com/api/rest/webhooks/rest/#link-verifywebhooksignature
 */

/**
 * Hosts a signing certificate may be fetched from.
 *
 * `cert_url` arrives in the request, and it is PayPal — not this server — that
 * dereferences it. An unchecked value would therefore let anyone who learns the
 * webhook URL point PayPal's fetcher wherever they liked, and would also be the
 * first step in presenting a certificate of the caller's own choosing. The
 * verification call would still refuse the result, but a request that cannot
 * be genuine is better refused before it is forwarded anywhere.
 */
const TRUSTED_CERT_HOSTS = ['api.paypal.com', 'api.sandbox.paypal.com'];

export function isTrustedCertUrl(certUrl: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(certUrl);
  } catch {
    return false;
  }

  // Exact host matches only. A suffix test would accept
  // `api.paypal.com.attacker.test`, which is the usual way this check is got
  // around.
  return parsed.protocol === 'https:' && TRUSTED_CERT_HOSTS.includes(parsed.hostname);
}

/**
 * The five transmission headers, or `null` if any is missing.
 *
 * All five are signed together, so a partial set is not a request to verify —
 * it is a malformed one, and asking PayPal about it would only spend a round
 * trip to be told so.
 */
export function readWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): PayPalWebhookHeaders | null {
  const read = (name: string): string | undefined => {
    const value = headers[name];
    const first = Array.isArray(value) ? value[0] : value;
    return first?.trim() ? first.trim() : undefined;
  };

  const authAlgo = read('paypal-auth-algo');
  const certUrl = read('paypal-cert-url');
  const transmissionId = read('paypal-transmission-id');
  const transmissionSig = read('paypal-transmission-sig');
  const transmissionTime = read('paypal-transmission-time');

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return null;
  }

  return { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime };
}
