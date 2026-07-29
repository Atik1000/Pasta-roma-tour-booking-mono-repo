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
 * The money path, end to end: browse → cart → checkout → booking.
 *
 * These run against a real Postgres so the seat-claiming SQL is genuinely
 * exercised. A regression here means overselling or lost bookings, which is
 * why this suite hits the database rather than mocking it.
 */
describe('Booking flow (e2e)', () => {
  let harness: Harness;
  let server: App;
  let fixture: SeedFixture;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    fixture = await seedMinimal(harness.prisma, { capacity: 10, maxTicketsPerTour: 6 });
  });

  describe('catalogue', () => {
    it('lists only published tours', async () => {
      const response = await request(server).get('/api/v1/tours').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].slug).toBe('colosseum-underground-tour');
      expect(response.body.meta.total).toBe(1);
    });

    it('hides a draft tour from the detail endpoint', async () => {
      await request(server).get('/api/v1/tours/secret-draft-tour').expect(404);
    });

    it('reports remaining seats per slot', async () => {
      const response = await request(server)
        .get(`/api/v1/tours/${fixture.tourSlug}/slots`)
        .query({ date: '2030-06-01' })
        .expect(200);

      expect(response.body.data).toEqual([
        expect.objectContaining({ time: '09:00', available: true, remaining: 10 }),
      ]);
    });

    it('rejects a malformed date instead of guessing', async () => {
      await request(server)
        .get(`/api/v1/tours/${fixture.tourSlug}/slots`)
        .query({ date: '01-06-2030' })
        .expect(422);
    });
  });

  describe('cart', () => {
    it('adds an item and returns totals including the booking fee', async () => {
      const response = await request(server)
        .post('/api/v1/cart/items')
        .send({ slug: fixture.tourSlug, slotId: fixture.slotId, quantity: 2 })
        .expect(201);

      expect(response.body.data).toMatchObject({
        totalTickets: 2,
        subtotalMinor: 11_800,
        bookingFeeMinor: 500,
        totalMinor: 12_300,
      });
    });

    it('refuses to exceed the per-tour ticket cap', async () => {
      const response = await request(server)
        .post('/api/v1/cart/items')
        .send({ slug: fixture.tourSlug, slotId: fixture.slotId, quantity: 7 })
        .expect(409);

      expect(response.body.error).toBe('MAX_TICKETS_EXCEEDED');
    });

    it('refuses to exceed the seats a slot actually has', async () => {
      const small = await harness.prisma.tourSlot.create({
        data: {
          tourId: fixture.tourId,
          date: new Date('2030-06-02T00:00:00.000Z'),
          time: '10:00',
          capacity: 1,
        },
      });

      const response = await request(server)
        .post('/api/v1/cart/items')
        .send({ slug: fixture.tourSlug, slotId: small.id, quantity: 2 })
        .expect(409);

      expect(response.body.error).toBe('SLOT_SOLD_OUT');
    });

    it('keeps separate sessions in separate carts', async () => {
      const first = await request(server)
        .post('/api/v1/cart/items')
        .send({ slug: fixture.tourSlug, slotId: fixture.slotId, quantity: 2 });
      const cookie = cookieFrom(first.headers, 'prt_cart');

      // A second visitor, with no cookie of their own.
      const second = await request(server).get('/api/v1/cart').expect(200);
      expect(second.body.data.items).toHaveLength(0);

      const mine = await request(server)
        .get('/api/v1/cart')
        .set('Cookie', cookie ?? '')
        .expect(200);
      expect(mine.body.data.items).toHaveLength(1);
    });
  });

  describe('checkout', () => {
    async function cartWith(quantity: number): Promise<string> {
      const response = await request(server)
        .post('/api/v1/cart/items')
        .send({ slug: fixture.tourSlug, slotId: fixture.slotId, quantity })
        .expect(201);

      return cookieFrom(response.headers, 'prt_cart') ?? '';
    }

    it('creates a booking with one ticket per traveller and claims the seats', async () => {
      const cookie = await cartWith(2);

      const response = await request(server)
        .post('/api/v1/checkout')
        .set('Cookie', cookie)
        .send({
          fullName: 'John Smith',
          email: 'John.Smith@Example.com',
          ticketHolders: [
            { firstName: 'John', lastName: 'Smith' },
            { firstName: 'Emily', lastName: 'Smith' },
          ],
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        totalMinor: 12_300,
        status: 'PENDING',
        currency: 'EUR',
      });
      expect(response.body.data.reference).toMatch(/^BK-\d{4}-\d{4}$/);

      const booking = await harness.prisma.booking.findUnique({
        where: { reference: response.body.data.reference },
        include: { items: { include: { tickets: true } }, payments: true, customer: true },
      });

      expect(booking?.items).toHaveLength(1);
      expect(booking?.items[0]?.tickets).toHaveLength(2);
      expect(booking?.payments[0]?.status).toBe('PENDING');
      // Emails are stored lower-cased so lookup is case-insensitive.
      expect(booking?.customer.email).toBe('john.smith@example.com');

      const slot = await harness.prisma.tourSlot.findUnique({ where: { id: fixture.slotId } });
      expect(slot?.booked).toBe(2);
    });

    it('empties the cart only after the booking exists', async () => {
      const cookie = await cartWith(1);

      await request(server)
        .post('/api/v1/checkout')
        .set('Cookie', cookie)
        .send({
          fullName: 'Solo Traveller',
          email: 'solo@example.com',
          ticketHolders: [{ firstName: 'Solo', lastName: 'Traveller' }],
        })
        .expect(201);

      const cart = await request(server).get('/api/v1/cart').set('Cookie', cookie).expect(200);
      expect(cart.body.data.items).toHaveLength(0);
    });

    it('rejects a holder count that does not match the tickets', async () => {
      const cookie = await cartWith(2);

      const response = await request(server)
        .post('/api/v1/checkout')
        .set('Cookie', cookie)
        .send({
          fullName: 'John Smith',
          email: 'john@example.com',
          ticketHolders: [{ firstName: 'John', lastName: 'Smith' }],
        })
        .expect(409);

      expect(response.body.message).toContain('2 tickets');
    });

    it('returns field-keyed errors the form can consume', async () => {
      const cookie = await cartWith(1);

      const response = await request(server)
        .post('/api/v1/checkout')
        .set('Cookie', cookie)
        .send({
          fullName: 'J',
          email: 'not-an-email',
          ticketHolders: [{ firstName: '', lastName: 'Smith' }],
        })
        .expect(422);

      const fields = (response.body.errors as { field: string }[]).map((error) => error.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'fullName']));
    });

    it('refuses to check out an empty cart', async () => {
      const response = await request(server)
        .post('/api/v1/checkout')
        .send({
          fullName: 'Nobody',
          email: 'nobody@example.com',
          ticketHolders: [{ firstName: 'No', lastName: 'Body' }],
        })
        .expect(409);

      expect(response.body.error).toBe('CART_EMPTY');
    });

    it('charges the catalogue price, not a stale cart price', async () => {
      const cookie = await cartWith(2);

      // The tour is repriced after the cart was filled.
      await harness.prisma.tour.update({
        where: { id: fixture.tourId },
        data: { priceAdultEur: 7900 },
      });

      const response = await request(server)
        .post('/api/v1/checkout')
        .set('Cookie', cookie)
        .send({
          fullName: 'Late Booker',
          email: 'late@example.com',
          ticketHolders: [
            { firstName: 'Late', lastName: 'Booker' },
            { firstName: 'Also', lastName: 'Late' },
          ],
        })
        .expect(201);

      // 2 × €79 + €5 fee, not the €59 captured when the item was added.
      expect(response.body.data.totalMinor).toBe(16_300);
    });

    it('does not oversell when several checkouts race for the last seats', async () => {
      const scarce = await harness.prisma.tourSlot.create({
        data: {
          tourId: fixture.tourId,
          date: new Date('2030-07-01T00:00:00.000Z'),
          time: '11:00',
          capacity: 3,
        },
      });

      // Five separate shoppers, each holding two tickets: ten chasing three seats.
      const cookies = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const response = await request(server)
            .post('/api/v1/cart/items')
            .send({ slug: fixture.tourSlug, slotId: scarce.id, quantity: 2 });
          return cookieFrom(response.headers, 'prt_cart') ?? '';
        }),
      );

      const results = await Promise.all(
        cookies.map((cookie, index) =>
          request(server)
            .post('/api/v1/checkout')
            .set('Cookie', cookie)
            .send({
              fullName: `Racer ${index}`,
              email: `racer${index}@example.com`,
              ticketHolders: [
                { firstName: 'A', lastName: `Racer${index}` },
                { firstName: 'B', lastName: `Racer${index}` },
              ],
            }),
        ),
      );

      const created = results.filter((result) => result.status === 201);
      const rejected = results.filter((result) => result.status === 409);

      // Three seats fit exactly one two-ticket booking.
      expect(created).toHaveLength(1);
      expect(rejected).toHaveLength(4);
      expect(rejected.every((result) => result.body.error === 'SLOT_SOLD_OUT')).toBe(true);

      const slot = await harness.prisma.tourSlot.findUnique({ where: { id: scarce.id } });
      expect(slot?.booked).toBe(2);
      expect(slot!.booked).toBeLessThanOrEqual(slot!.capacity);

      // The four failures must not have left half-written bookings behind.
      expect(await harness.prisma.booking.count()).toBe(1);
      expect(await harness.prisma.ticket.count()).toBe(2);
    });
  });
});
