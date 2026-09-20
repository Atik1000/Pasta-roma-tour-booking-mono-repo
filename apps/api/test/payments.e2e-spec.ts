import request from 'supertest';
import type { App } from 'supertest/types';

import {
  cookieFrom,
  createHarness,
  resetDatabase,
  seedMinimal,
  type Harness,
  type SeedFixture,
} from './harness';

/**
 * The payment surface as it behaves with no gateway credentials — which is how
 * development and CI actually run.
 *
 * The point is that an unconfigured environment degrades honestly: the routes
 * exist, they are reachable, authorisation is still enforced, and they answer
 * 503 rather than 500 or, worse, pretending to succeed. Each gateway's own
 * behaviour is covered by `stripe-payments.service.spec.ts`,
 * `revolut-payments.service.spec.ts` and `paypal-payments.service.spec.ts`,
 * which stub the client so the rules are
 * verifiable without live keys.
 */
describe('Payments (e2e, no gateway configured)', () => {
  let harness: Harness;
  let server: App;
  let fixture: SeedFixture;
  let token: string;
  let reference: string;
  let paymentId: string;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    fixture = await seedMinimal(harness.prisma);

    const customer = await harness.prisma.customer.create({
      data: { email: 'payer@example.com', fullName: 'Ada Lovelace' },
    });

    const booking = await harness.prisma.booking.create({
      data: {
        reference: 'BK-PAY-1',
        customerId: customer.id,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        currency: 'EUR',
        subtotal: 4000,
        bookingFee: 500,
        total: 4500,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        items: {
          create: {
            tourId: fixture.tourId,
            tourTitle: 'Colosseum Underground Tour',
            quantity: 2,
            unitPrice: 2000,
            amount: 4000,
          },
        },
        payments: {
          create: { method: 'CARD', status: 'PENDING', amount: 4500, currency: 'EUR' },
        },
      },
      include: { payments: true },
    });

    reference = booking.reference;
    paymentId = booking.payments[0]!.id;

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: fixture.adminEmail, password: fixture.adminPassword })
      .expect(200);

    token = login.body.data.accessToken as string;
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  describe('degrading without credentials', () => {
    it('answers 503 on the payment intent rather than 500', async () => {
      const response = await request(server)
        .post(`/api/v1/checkout/${reference}/payment-intent`)
        .expect(503);

      expect(response.body.message).toMatch(/not configured/i);
    });

    it('answers 503 on the webhook rather than accepting an unverified event', async () => {
      await request(server)
        .post('/api/v1/payments/webhook')
        .set('stripe-signature', 'anything')
        .send({ type: 'payment_intent.succeeded' })
        .expect(503);
    });

    it('answers 503 on the Revolut webhook too, on its own path', async () => {
      await request(server)
        .post('/api/v1/payments/webhook/revolut')
        .set('revolut-signature', 'v1=anything')
        .set('revolut-request-timestamp', String(Date.now()))
        .send({ event: 'ORDER_COMPLETED', order_id: 'ord_x' })
        .expect(503);
    });

    it('answers 503 on the PayPal webhook too, on its own path', async () => {
      await request(server)
        .post('/api/v1/payments/webhook/paypal')
        .set('paypal-auth-algo', 'SHA256withRSA')
        .set('paypal-cert-url', 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1')
        .set('paypal-transmission-id', 'tx-1')
        .set('paypal-transmission-sig', 'sig-1')
        .set('paypal-transmission-time', new Date().toISOString())
        .send({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'cap_x' } })
        .expect(503);
    });

    it('answers 503 on the PayPal capture rather than 500', async () => {
      await request(server)
        .post(`/api/v1/checkout/${reference}/paypal/capture`)
        .send({ orderId: '5O190127TN364715T' })
        .expect(503);
    });

    /**
     * The form must not offer a gateway that cannot take money — that is how
     * `CARD` once produced bookings that dead-ended on a 503 payment screen.
     */
    it('leaves PayPal off the offered payment methods', async () => {
      const response = await request(server).get('/api/v1/checkout/payment-methods').expect(200);

      expect(response.body.data.methods).toEqual(['CASH', 'PAY_LATER']);
    });

    it('refuses a PayPal booking outright rather than creating one that cannot be paid', async () => {
      const added = await request(server)
        .post('/api/v1/cart/items')
        .send({ slug: fixture.tourSlug, quantity: 1 })
        .expect(201);

      const response = await request(server)
        .post('/api/v1/checkout')
        .set('Cookie', cookieFrom(added.headers, 'prt_cart') ?? '')
        .send({
          fullName: 'Ada Lovelace',
          email: 'ada@example.test',
          ticketHolders: [{ firstName: 'Ada', lastName: 'Lovelace' }],
          paymentMethod: 'PAYPAL',
        })
        .expect(409);

      expect(response.body.message).toMatch(/not available/i);

      // And nothing was written: a booking waiting on a gateway that cannot
      // take money is one the sweeper cancels half an hour later.
      expect(
        await harness.prisma.booking.count({ where: { reference: { not: 'BK-PAY-1' } } }),
      ).toBe(0);
    });

    it('leaves the booking untouched when a webhook is refused', async () => {
      await request(server)
        .post('/api/v1/payments/webhook')
        .set('stripe-signature', 't=1,v1=forged')
        .send({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_x' } } })
        .expect(503);

      const booking = await harness.prisma.booking.findUniqueOrThrow({ where: { reference } });
      expect(booking.status).toBe('PENDING');
      expect(booking.paymentStatus).toBe('PENDING');
    });

    it('answers 503 on a refund', async () => {
      await auth(
        request(server).post(`/api/v1/admin/payments/${paymentId}/refund`).send({}),
      ).expect(503);
    });
  });

  describe('status', () => {
    it('reports the booking status without revealing anything else', async () => {
      const response = await request(server)
        .get(`/api/v1/checkout/${reference}/status`)
        .expect(200);

      expect(response.body.data).toEqual({
        reference,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      });
      // No name, address or amount: a reference is not a secret, so this must
      // not become a lookup for somebody else's details.
      expect(JSON.stringify(response.body)).not.toContain('payer@example.com');
      expect(JSON.stringify(response.body)).not.toContain('Ada');
    });

    it('reflects a confirmed booking', async () => {
      await harness.prisma.booking.update({
        where: { reference },
        data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
      });

      const response = await request(server)
        .get(`/api/v1/checkout/${reference}/status`)
        .expect(200);

      expect(response.body.data.paymentStatus).toBe('PAID');
    });

    it('404s for a reference that does not exist', async () => {
      await request(server).get('/api/v1/checkout/BK-NOPE/status').expect(404);
    });
  });

  describe('authorisation', () => {
    it('keeps refunds closed to anonymous callers', async () => {
      await request(server).post(`/api/v1/admin/payments/${paymentId}/refund`).send({}).expect(401);
    });

    it('keeps refunds closed to an editor — money is an admin concern', async () => {
      const editorPassword = 'EditorPassword123!';
      const { hash } = await import('@node-rs/argon2');

      await harness.prisma.user.create({
        data: {
          email: 'editor@example.com',
          name: 'Ed Editor',
          role: 'EDITOR',
          passwordHash: await hash(editorPassword, {
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          }),
        },
      });

      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'editor@example.com', password: editorPassword })
        .expect(200);

      await request(server)
        .post(`/api/v1/admin/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${login.body.data.accessToken}`)
        .send({})
        .expect(403);
    });

    it('rejects a malformed payment id before it reaches the database', async () => {
      await auth(request(server).post('/api/v1/admin/payments/not-a-uuid/refund').send({})).expect(
        400,
      );
    });

    it('rejects a refund amount of zero', async () => {
      await auth(
        request(server).post(`/api/v1/admin/payments/${paymentId}/refund`).send({ amountMinor: 0 }),
      ).expect(422);
    });
  });
});
