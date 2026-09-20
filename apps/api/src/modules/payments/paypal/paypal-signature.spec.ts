import { isTrustedCertUrl, readWebhookHeaders } from './paypal-signature';

/**
 * The local half of PayPal webhook authentication.
 *
 * The verdict itself comes from PayPal, but these two checks decide whether a
 * request is worth asking about — and the certificate check is the one that
 * stops an attacker using this endpoint to point PayPal's fetcher wherever
 * they like.
 */
describe('isTrustedCertUrl', () => {
  it('accepts PayPal’s own certificate hosts', () => {
    expect(isTrustedCertUrl('https://api.paypal.com/v1/notifications/certs/CERT-360caa42')).toBe(
      true,
    );
    expect(isTrustedCertUrl('https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1')).toBe(
      true,
    );
  });

  /** The usual way a suffix check is got around. */
  it('refuses a host that merely ends in PayPal’s', () => {
    expect(isTrustedCertUrl('https://api.paypal.com.attacker.test/certs/CERT-1')).toBe(false);
  });

  it('refuses a host that merely contains PayPal’s', () => {
    expect(isTrustedCertUrl('https://attacker.test/api.paypal.com/certs/CERT-1')).toBe(false);
  });

  it('refuses plain http, even to the right host', () => {
    expect(isTrustedCertUrl('http://api.paypal.com/v1/notifications/certs/CERT-1')).toBe(false);
  });

  it('refuses something that is not a URL at all', () => {
    expect(isTrustedCertUrl('api.paypal.com')).toBe(false);
    expect(isTrustedCertUrl('')).toBe(false);
  });
});

describe('readWebhookHeaders', () => {
  const complete = {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
    'paypal-transmission-id': 'tx-1',
    'paypal-transmission-sig': 'sig-1',
    'paypal-transmission-time': '2026-09-20T10:53:32Z',
  };

  it('reads all five transmission headers', () => {
    expect(readWebhookHeaders(complete)).toEqual({
      authAlgo: 'SHA256withRSA',
      certUrl: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
      transmissionId: 'tx-1',
      transmissionSig: 'sig-1',
      transmissionTime: '2026-09-20T10:53:32Z',
    });
  });

  /** All five are signed together, so four of them is not a request to verify. */
  it.each(Object.keys(complete))('refuses a set missing %s', (missing) => {
    const partial = { ...complete, [missing]: undefined };

    expect(readWebhookHeaders(partial)).toBeNull();
  });

  it('treats an empty header as missing', () => {
    expect(readWebhookHeaders({ ...complete, 'paypal-transmission-sig': '   ' })).toBeNull();
  });

  it('takes the first of a repeated header rather than joining them', () => {
    const repeated = { ...complete, 'paypal-transmission-id': ['tx-1', 'tx-2'] };

    expect(readWebhookHeaders(repeated)?.transmissionId).toBe('tx-1');
  });
});
