import { createHmac } from 'node:crypto';

import {
  isTimestampFresh,
  parseSignatureHeader,
  SIGNATURE_TOLERANCE_MS,
  verifySignature,
} from './revolut-signature';

const SECRET = 'wsk_test_secret';
const TIMESTAMP = '1754000000000';

function sign(body: string, secret = SECRET, timestamp = TIMESTAMP, version = 'v1'): string {
  const digest = createHmac('sha256', secret)
    .update(`${version}.${timestamp}.${body}`)
    .digest('hex');

  return `${version}=${digest}`;
}

/**
 * The webhook signature is the only authentication on an endpoint that marks
 * bookings paid, so these are the tests that matter most in this module: every
 * case below is a way someone could otherwise confirm a booking they have not
 * paid for.
 */
describe('Revolut webhook signatures', () => {
  const body = '{"event":"ORDER_COMPLETED","order_id":"6516e1af-…"}';

  it('accepts a payload signed with the configured secret', () => {
    expect(
      verifySignature({
        header: sign(body),
        timestamp: TIMESTAMP,
        rawBody: Buffer.from(body),
        secrets: [SECRET],
      }),
    ).toBe(true);
  });

  it('rejects a payload signed with a different secret', () => {
    expect(
      verifySignature({
        header: sign(body, 'wsk_someone_elses'),
        timestamp: TIMESTAMP,
        rawBody: Buffer.from(body),
        secrets: [SECRET],
      }),
    ).toBe(false);
  });

  it('rejects a body that was edited after signing', () => {
    const header = sign(body);
    const tampered = body.replace('ORDER_COMPLETED', 'ORDER_AUTHORISED');

    expect(
      verifySignature({
        header,
        timestamp: TIMESTAMP,
        rawBody: Buffer.from(tampered),
        secrets: [SECRET],
      }),
    ).toBe(false);
  });

  it('rejects a signature lifted from a different timestamp', () => {
    expect(
      verifySignature({
        header: sign(body),
        timestamp: '1754000060000',
        rawBody: Buffer.from(body),
        secrets: [SECRET],
      }),
    ).toBe(false);
  });

  /** The whole point of accepting a list: a rotation must not drop events. */
  it('accepts either secret while one is being rotated out', () => {
    const secrets = ['wsk_old', 'wsk_new'];

    for (const secret of secrets) {
      expect(
        verifySignature({
          header: sign(body, secret),
          timestamp: TIMESTAMP,
          rawBody: Buffer.from(body),
          secrets,
        }),
      ).toBe(true);
    }
  });

  it('refuses everything when no secret is configured', () => {
    expect(
      verifySignature({
        header: sign(body),
        timestamp: TIMESTAMP,
        rawBody: Buffer.from(body),
        secrets: [],
      }),
    ).toBe(false);
  });

  it.each([
    ['a missing header', undefined],
    ['a header with no version', 'abcdef'],
    ['a non-hex signature', 'v1=zzzz'],
  ])('rejects %s', (_label, header) => {
    expect(
      verifySignature({
        header,
        timestamp: TIMESTAMP,
        rawBody: Buffer.from(body),
        secrets: [SECRET],
      }),
    ).toBe(false);
  });

  it('reads every entry out of a multi-signature header', () => {
    expect(parseSignatureHeader('v1=aaa, v1=bbb')).toEqual([
      { version: 'v1', signature: 'aaa' },
      { version: 'v1', signature: 'bbb' },
    ]);
  });
});

describe('Revolut webhook timestamps', () => {
  const now = 1_754_000_000_000;

  it('accepts one signed a moment ago', () => {
    expect(isTimestampFresh(String(now - 1_000), now)).toBe(true);
  });

  /** Without this, a captured payload could be replayed forever. */
  it('rejects one older than the tolerance window', () => {
    expect(isTimestampFresh(String(now - SIGNATURE_TOLERANCE_MS - 1), now)).toBe(false);
  });

  it('rejects one from the future', () => {
    expect(isTimestampFresh(String(now + 1_000), now)).toBe(false);
  });

  it.each([undefined, '', 'not-a-number'])('rejects %p', (value) => {
    expect(isTimestampFresh(value, now)).toBe(false);
  });
});
