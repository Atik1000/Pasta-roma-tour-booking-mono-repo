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
 * Editing what a booking contains, after it exists.
 *
 * These are the same guarantees checkout makes, applied to a record that is
 * already sold: seats cannot be oversold, released seats cannot go negative,
 * and the total always equals the items plus one booking fee.
 */
describe('Admin booking items (e2e)', () => {
  let harness: Harness;
  let server: App;
  let fixture: SeedFixture;
  let token: string;
  let reference: string;

  const BOOKING_FEE = 500;
  /** The second fixture tour's catalogue price. A new item is priced from this. */
  const SECOND_TOUR_PRICE = 7500;
  /** What the seeded booking actually paid — deliberately not the catalogue price. */
  const BOOKED_PRICE = 1000;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await harness.close();
  });

  /** A confirmed booking holding 2 tickets on the fixture's tour. */
  async function seedBooking(): Promise<string> {
    const customer = await harness.prisma.customer.create({
      data: { email: 'editor-test@example.com', fullName: 'Ada Lovelace' },
    });

    const booking = await harness.prisma.booking.create({
      data: {
        reference: 'BK-EDIT-1',
        customerId: customer.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        currency: 'EUR',
        subtotal: 2000,
        bookingFee: BOOKING_FEE,
        total: 2500,
        items: {
          create: {
            tourId: fixture.tourId,
            tourTitle: 'Colosseum Underground Tour',
            quantity: 2,
            unitPrice: 1000,
            amount: 2000,
            tickets: {
              create: [
                { holderFirstName: 'Ada', holderLastName: 'Lovelace', code: 'TK-EDIT-1' },
                { holderFirstName: 'Alan', holderLastName: 'Turing', code: 'TK-EDIT-2' },
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
    fixture = await seedMinimal(harness.prisma, { maxTicketsPerTour: 6 });
    reference = await seedBooking();

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: fixture.adminEmail, password: fixture.adminPassword })
      .expect(200);

    token = login.body.data.accessToken as string;
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  const itemId = async () =>
    (await harness.prisma.bookingItem.findFirstOrThrow({ where: { booking: { reference } } })).id;

  const totals = async () =>
    harness.prisma.booking.findUniqueOrThrow({
      where: { reference },
      select: { subtotal: true, bookingFee: true, total: true },
    });

  describe('adding a tour', () => {
    it('prices from the catalogue and retotals', async () => {
      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          tourId: fixture.secondTourId,
          quantity: 3,
        }),
      ).expect(201);

      // Priced from the catalogue, not from the price this booking already
      // paid — a new line is a new sale.
      const expected = 2 * BOOKED_PRICE + 3 * SECOND_TOUR_PRICE;

      expect(response.body.data).toMatchObject({
        subtotal: expected,
        bookingFee: BOOKING_FEE,
        total: expected + BOOKING_FEE,
      });

      expect(await totals()).toEqual({
        subtotal: expected,
        bookingFee: BOOKING_FEE,
        total: expected + BOOKING_FEE,
      });
    });

    it('issues one ticket per traveller, naming those it was given', async () => {
      const response = await auth(
        request(server)
          .post(`/api/v1/admin/bookings/${reference}/items`)
          .send({
            tourId: fixture.secondTourId,
            quantity: 2,
            holders: [{ firstName: 'Grace', lastName: 'Hopper' }],
          }),
      ).expect(201);

      const tickets = await harness.prisma.ticket.findMany({
        where: { bookingItemId: response.body.data.id },
        orderBy: { createdAt: 'asc' },
      });

      expect(tickets).toHaveLength(2);
      expect(tickets[0]).toMatchObject({ holderFirstName: 'Grace', holderLastName: 'Hopper' });
      // The unnamed seat still gets a ticket, with a placeholder holder.
      expect(tickets[1]?.holderFirstName).toBe('Guest');
      expect(new Set(tickets.map((ticket) => ticket.code)).size).toBe(2);
    });

    it("refuses more tickets than the tour's own cap, writing nothing", async () => {
      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          tourId: fixture.secondTourId,
          quantity: 7,
        }),
      ).expect(409);

      expect(response.body.error).toBe('MAX_TICKETS_EXCEEDED');
      expect(await harness.prisma.bookingItem.count()).toBe(1);
      expect(await totals()).toEqual({ subtotal: 2000, bookingFee: BOOKING_FEE, total: 2500 });
    });

    it('refuses the same tour twice', async () => {
      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          tourId: fixture.tourId,
          quantity: 1,
        }),
      ).expect(409);

      expect(response.body.message).toMatch(/already on this booking/);
      expect(await harness.prisma.bookingItem.count()).toBe(1);
    });

    it('refuses to edit a cancelled booking', async () => {
      await harness.prisma.booking.update({
        where: { reference },
        data: { status: 'CANCELLED' },
      });

      await auth(
        request(server)
          .post(`/api/v1/admin/bookings/${reference}/items`)
          .send({ tourId: fixture.secondTourId, quantity: 1 }),
      ).expect(409);
    });

    it('404s for a tour that does not exist', async () => {
      await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          tourId: '00000000-0000-4000-8000-000000000000',
          quantity: 1,
        }),
      ).expect(404);
    });

    it('is closed to anonymous callers', async () => {
      await request(server)
        .post(`/api/v1/admin/bookings/${reference}/items`)
        .send({ tourId: fixture.secondTourId, quantity: 1 })
        .expect(401);
    });
  });

  describe('changing a tour', () => {
    it('retotals when quantity goes up', async () => {
      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 5 }),
      ).expect(200);

      expect(await totals()).toEqual({
        subtotal: 5 * BOOKED_PRICE,
        bookingFee: BOOKING_FEE,
        total: 5 * BOOKED_PRICE + BOOKING_FEE,
      });
      expect(await harness.prisma.ticket.count()).toBe(5);
    });

    it('retotals when quantity goes down, keeping the earliest codes', async () => {
      const before = await harness.prisma.ticket.findMany({ orderBy: { createdAt: 'asc' } });

      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 1 }),
      ).expect(200);

      expect(await totals()).toEqual({
        subtotal: BOOKED_PRICE,
        bookingFee: BOOKING_FEE,
        total: BOOKED_PRICE + BOOKING_FEE,
      });

      const after = await harness.prisma.ticket.findMany();
      expect(after).toHaveLength(1);
      // The surviving ticket keeps its code, so an already-downloaded ticket
      // is not silently invalidated.
      expect(after[0]?.code).toBe(before[0]?.code);
    });

    it("refuses an increase past the tour's cap, changing nothing", async () => {
      const response = await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 7 }),
      ).expect(409);

      expect(response.body.error).toBe('MAX_TICKETS_EXCEEDED');
      expect(await totals()).toEqual({
        subtotal: 2 * BOOKED_PRICE,
        bookingFee: BOOKING_FEE,
        total: 2 * BOOKED_PRICE + BOOKING_FEE,
      });
    });

    it('renames ticket holders without reissuing their codes', async () => {
      const before = await harness.prisma.ticket.findMany({ orderBy: { createdAt: 'asc' } });

      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({
            quantity: 2,
            holders: [
              { firstName: 'Grace', lastName: 'Hopper' },
              { firstName: 'Katherine', lastName: 'Johnson' },
            ],
          }),
      ).expect(200);

      const after = await harness.prisma.ticket.findMany({ orderBy: { createdAt: 'asc' } });
      expect(after.map((ticket) => ticket.holderFirstName)).toEqual(['Grace', 'Katherine']);
      expect(after.map((ticket) => ticket.code)).toEqual(before.map((ticket) => ticket.code));
    });

    it('will not reprice a booking when the catalogue price changes', async () => {
      await harness.prisma.tour.update({
        where: { id: fixture.tourId },
        data: { priceAdultEur: 9999 },
      });

      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 3 }),
      ).expect(200);

      // Still the booked price per ticket, not the new catalogue price.
      expect(await totals()).toEqual({
        subtotal: 3 * BOOKED_PRICE,
        bookingFee: BOOKING_FEE,
        total: 3 * BOOKED_PRICE + BOOKING_FEE,
      });
    });

    it('rejects a quantity of zero — removal is its own operation', async () => {
      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 0 }),
      ).expect(422);
    });

    it('404s for an item belonging to a different booking', async () => {
      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/00000000-0000-4000-8000-000000000000`)
          .send({ quantity: 1 }),
      ).expect(404);
    });
  });

  describe('removing a tour', () => {
    it('drops the fee with the last item', async () => {
      await auth(
        request(server).delete(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`),
      ).expect(200);

      // An empty booking owes nothing at all, fee included.
      expect(await totals()).toEqual({ subtotal: 0, bookingFee: 0, total: 0 });
      expect(await harness.prisma.ticket.count()).toBe(0);
    });

    it('keeps the fee while another tour remains', async () => {
      await auth(
        request(server)
          .post(`/api/v1/admin/bookings/${reference}/items`)
          .send({ tourId: fixture.secondTourId, quantity: 1 }),
      ).expect(201);

      await auth(
        request(server).delete(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`),
      ).expect(200);

      expect(await totals()).toEqual({
        subtotal: SECOND_TOUR_PRICE,
        bookingFee: BOOKING_FEE,
        total: SECOND_TOUR_PRICE + BOOKING_FEE,
      });
    });

    it('leaves an audit note behind', async () => {
      await auth(
        request(server).delete(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`),
      ).expect(200);

      const notes = await harness.prisma.bookingNote.findMany();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.body).toMatch(/Removed Colosseum Underground Tour/);
    });
  });
});
