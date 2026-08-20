import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';

import {
  createHarness,
  resetDatabase,
  seedMinimal,
  type Harness,
  type SeedFixture,
} from './harness';

/**
 * Invoices, e-tickets and the CSV export.
 *
 * The security assertion here matters as much as the formatting one: a booking
 * reference is printed on emails and screens, so it is an identifier and not a
 * secret. Traveller documents must therefore demand the signed lookup token,
 * and that token must not unlock somebody else's booking.
 */
describe('Booking documents (e2e)', () => {
  let harness: Harness;
  let server: App;
  let fixture: SeedFixture;
  let token: string;
  let reference: string;
  let customerEmail: string;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await harness.close();
  });

  /** A confirmed booking with two issued tickets. */
  async function seedBooking(email = 'traveller@example.com'): Promise<string> {
    const customer = await harness.prisma.customer.create({
      data: { email, fullName: 'Ada Lovelace', phone: '+39 06 1234' },
    });

    const booking = await harness.prisma.booking.create({
      data: {
        reference: `BK-TEST-${Math.abs(email.length * 7919) % 9000}`,
        customerId: customer.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        currency: 'EUR',
        subtotal: 4000,
        bookingFee: 500,
        total: 4500,
        items: {
          create: {
            tourId: fixture.tourId,
            tourTitle: 'Colosseum Underground Tour',
            quantity: 2,
            unitPrice: 2000,
            amount: 4000,
            tickets: {
              create: [
                { holderFirstName: 'Ada', holderLastName: 'Lovelace', code: `TK-${email}-1` },
                { holderFirstName: 'Alan', holderLastName: 'Turing', code: `TK-${email}-2` },
              ],
            },
          },
        },
      },
    });

    return booking.reference;
  }

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    fixture = await seedMinimal(harness.prisma);
    customerEmail = 'traveller@example.com';
    reference = await seedBooking(customerEmail);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: fixture.adminEmail, password: fixture.adminPassword })
      .expect(200);

    token = login.body.data.accessToken as string;
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  /** Mints the same signed link the lookup email carries. */
  function lookupToken(email: string): string {
    return harness.app
      .get(JwtService)
      .sign(
        { email, typ: 'booking-lookup' },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: 600 },
      );
  }

  describe('admin invoice', () => {
    it('returns a PDF inline', async () => {
      const response = await auth(
        request(server).get(`/api/v1/admin/bookings/${reference}/invoice`),
      ).expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('inline');
      // Every PDF starts with this signature; anything else is not a document.
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('404s for an unknown booking', async () => {
      await auth(request(server).get('/api/v1/admin/bookings/BK-NOPE-1/invoice')).expect(404);
    });

    it('is closed to anonymous callers', async () => {
      await request(server).get(`/api/v1/admin/bookings/${reference}/invoice`).expect(401);
    });
  });

  describe('admin e-tickets', () => {
    it('returns one PDF as an attachment', async () => {
      const response = await auth(
        request(server).get(`/api/v1/admin/bookings/${reference}/tickets`),
      ).expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
      // Two tickets means two pages; the smaller invoice is a single page.
      expect(response.body.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length).toBe(2);
    });

    it('still produces a document when no tickets are issued yet', async () => {
      const pending = await harness.prisma.booking.create({
        data: {
          reference: 'BK-TEST-EMPTY',
          customerId: (await harness.prisma.customer.findFirstOrThrow()).id,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          currency: 'EUR',
          subtotal: 0,
          bookingFee: 0,
          total: 0,
        },
      });

      const response = await auth(
        request(server).get(`/api/v1/admin/bookings/${pending.reference}/tickets`),
      ).expect(200);

      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('CSV export', () => {
    it('exports a header and one row per booking', async () => {
      const response = await auth(request(server).get('/api/v1/admin/bookings/export')).expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('bookings.csv');

      const csv = response.text;
      const lines = csv.trim().split('\r\n');

      // A byte-order mark, so Excel reads it as UTF-8 rather than the local codepage.
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(lines[0]).toContain('Reference,Booked At,Customer');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(reference);
      // Money is exported in major units for spreadsheet readers.
      expect(lines[1]).toContain('45.00');
    });

    it('honours the status filter', async () => {
      const response = await auth(
        request(server).get('/api/v1/admin/bookings/export?status=CANCELLED'),
      ).expect(200);

      expect(response.text.trim().split('\r\n')).toHaveLength(1);
    });

    it('quotes a field containing a comma rather than splitting the row', async () => {
      await harness.prisma.customer.updateMany({
        where: { email: customerEmail },
        data: { fullName: 'Lovelace, Ada' },
      });

      const response = await auth(request(server).get('/api/v1/admin/bookings/export')).expect(200);
      const lines = response.text.trim().split('\r\n');

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('"Lovelace, Ada"');
    });

    it('does not let the parameterised booking route swallow the export path', async () => {
      // `bookings/:reference` is declared after `bookings/export`; if that order
      // ever flips, this returns 404 instead of a CSV.
      const response = await auth(request(server).get('/api/v1/admin/bookings/export')).expect(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  describe('traveller documents', () => {
    it('serves tickets to the holder of the signed link', async () => {
      const response = await request(server)
        .get(`/api/v1/bookings/${reference}/tickets`)
        .query({ token: lookupToken(customerEmail) })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('refuses a reference without a token', async () => {
      await request(server).get(`/api/v1/bookings/${reference}/tickets`).expect(401);
    });

    it('refuses a forged token', async () => {
      await request(server)
        .get(`/api/v1/bookings/${reference}/tickets`)
        .query({ token: 'not.a.jwt' })
        .expect(401);
    });

    it("refuses another customer's valid token", async () => {
      const otherReference = await seedBooking('someone.else@example.com');

      // A perfectly valid token — for a different inbox.
      await request(server)
        .get(`/api/v1/bookings/${otherReference}/tickets`)
        .query({ token: lookupToken(customerEmail) })
        .expect(404);
    });

    it('refuses an access token in place of a lookup token', async () => {
      await request(server)
        .get(`/api/v1/bookings/${reference}/tickets`)
        .query({ token })
        .expect(401);
    });

    it('serves the invoice under the same rules', async () => {
      await request(server)
        .get(`/api/v1/bookings/${reference}/invoice`)
        .query({ token: lookupToken(customerEmail) })
        .expect(200);

      await request(server).get(`/api/v1/bookings/${reference}/invoice`).expect(401);
    });
  });

  describe('confirmation email', () => {
    it('sends to the booking address and records a note', async () => {
      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/send-confirmation`),
      ).expect(200);

      expect(response.body.data.sentTo).toBe(customerEmail);

      const notes = await harness.prisma.bookingNote.findMany({
        where: { booking: { reference } },
      });
      expect(notes).toHaveLength(1);
      expect(notes[0]?.body).toContain(customerEmail);
    });

    it('refuses to confirm a cancelled booking', async () => {
      await harness.prisma.booking.update({
        where: { reference },
        data: { status: 'CANCELLED' },
      });

      await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/send-confirmation`),
      ).expect(409);
    });

    it('is closed to anonymous callers', async () => {
      await request(server)
        .post(`/api/v1/admin/bookings/${reference}/send-confirmation`)
        .expect(401);
    });
  });
});
