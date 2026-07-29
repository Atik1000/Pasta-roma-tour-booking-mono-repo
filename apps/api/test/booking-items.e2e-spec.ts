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
  /** The fixture tour's catalogue price. A new item is priced from this. */
  const CATALOGUE_PRICE = 5900;
  /** What the seeded booking actually paid — deliberately not the catalogue price. */
  const BOOKED_PRICE = 1000;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as App;
  });

  afterAll(async () => {
    await harness.close();
  });

  /** A confirmed booking holding 2 seats on the fixture's departure. */
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
            slotId: fixture.slotId,
            tourTitle: 'Colosseum Underground Tour',
            date: new Date('2030-06-01T00:00:00.000Z'),
            time: '09:00',
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

    // The seeded booking holds two of the slot's seats.
    await harness.prisma.tourSlot.update({
      where: { id: fixture.slotId },
      data: { booked: 2 },
    });

    return booking.reference;
  }

  /** A second departure on the same tour, so items can be added. */
  async function secondSlot(capacity = 10): Promise<string> {
    const slot = await harness.prisma.tourSlot.create({
      data: {
        tourId: fixture.tourId,
        date: new Date('2030-06-02T00:00:00.000Z'),
        time: '14:00',
        capacity,
      },
    });

    return slot.id;
  }

  beforeEach(async () => {
    await resetDatabase(harness.prisma);
    fixture = await seedMinimal(harness.prisma, { capacity: 10, maxTicketsPerTour: 6 });
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

  const slotBooked = async (id: string) =>
    (await harness.prisma.tourSlot.findUniqueOrThrow({ where: { id } })).booked;

  const totals = async () =>
    harness.prisma.booking.findUniqueOrThrow({
      where: { reference },
      select: { subtotal: true, bookingFee: true, total: true },
    });

  describe('adding a tour', () => {
    it('claims seats, prices from the catalogue and retotals', async () => {
      const slotId = await secondSlot();

      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          slotId,
          quantity: 3,
        }),
      ).expect(201);

      // Priced from the catalogue, not from the price this booking already
      // paid — a new line is a new sale.
      const expected = 2 * BOOKED_PRICE + 3 * CATALOGUE_PRICE;

      expect(response.body.data).toMatchObject({
        subtotal: expected,
        bookingFee: BOOKING_FEE,
        total: expected + BOOKING_FEE,
      });

      expect(await slotBooked(slotId)).toBe(3);
      expect(await totals()).toEqual({
        subtotal: expected,
        bookingFee: BOOKING_FEE,
        total: expected + BOOKING_FEE,
      });
    });

    it('issues one ticket per seat, naming those it was given', async () => {
      const slotId = await secondSlot();

      const response = await auth(
        request(server)
          .post(`/api/v1/admin/bookings/${reference}/items`)
          .send({
            slotId,
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

    it('refuses to oversell a departure', async () => {
      const slotId = await secondSlot(2);

      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          slotId,
          quantity: 3,
        }),
      ).expect(409);

      expect(response.body.error).toBe('SLOT_SOLD_OUT');
      // Nothing was written: no seats claimed, no item, no retotal.
      expect(await slotBooked(slotId)).toBe(0);
      expect(await harness.prisma.bookingItem.count()).toBe(1);
      expect(await totals()).toEqual({ subtotal: 2000, bookingFee: BOOKING_FEE, total: 2500 });
    });

    it("refuses more tickets than the tour's own cap", async () => {
      const slotId = await secondSlot(100);

      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          slotId,
          quantity: 7,
        }),
      ).expect(409);

      expect(response.body.error).toBe('MAX_TICKETS_EXCEEDED');
      expect(await slotBooked(slotId)).toBe(0);
    });

    it('refuses the same departure twice', async () => {
      const response = await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          slotId: fixture.slotId,
          quantity: 1,
        }),
      ).expect(409);

      expect(response.body.message).toMatch(/already on this booking/);
      // The duplicate check runs before the claim, so no seat was taken.
      expect(await slotBooked(fixture.slotId)).toBe(2);
    });

    it('refuses to edit a cancelled booking', async () => {
      await harness.prisma.booking.update({
        where: { reference },
        data: { status: 'CANCELLED' },
      });

      await auth(
        request(server)
          .post(`/api/v1/admin/bookings/${reference}/items`)
          .send({ slotId: await secondSlot(), quantity: 1 }),
      ).expect(409);
    });

    it('404s for a departure that does not exist', async () => {
      await auth(
        request(server).post(`/api/v1/admin/bookings/${reference}/items`).send({
          slotId: '00000000-0000-4000-8000-000000000000',
          quantity: 1,
        }),
      ).expect(404);
    });

    it('is closed to anonymous callers', async () => {
      await request(server)
        .post(`/api/v1/admin/bookings/${reference}/items`)
        .send({ slotId: await secondSlot(), quantity: 1 })
        .expect(401);
    });
  });

  describe('changing a tour', () => {
    it('claims the extra seats when quantity goes up', async () => {
      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 5 }),
      ).expect(200);

      expect(await slotBooked(fixture.slotId)).toBe(5);
      expect(await totals()).toEqual({
        subtotal: 5 * BOOKED_PRICE,
        bookingFee: BOOKING_FEE,
        total: 5 * BOOKED_PRICE + BOOKING_FEE,
      });
      expect(await harness.prisma.ticket.count()).toBe(5);
    });

    it('releases seats when quantity goes down, keeping the earliest codes', async () => {
      const before = await harness.prisma.ticket.findMany({ orderBy: { createdAt: 'asc' } });

      await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 1 }),
      ).expect(200);

      expect(await slotBooked(fixture.slotId)).toBe(1);
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

    it('refuses an increase the departure cannot hold, changing nothing', async () => {
      // Shrink the departure to exactly what this booking already holds, so
      // any increase must be refused.
      await harness.prisma.tourSlot.update({
        where: { id: fixture.slotId },
        data: { capacity: 2 },
      });

      const response = await auth(
        request(server)
          .patch(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`)
          .send({ quantity: 3 }),
      ).expect(409);

      expect(response.body.error).toBe('SLOT_SOLD_OUT');
      expect(await slotBooked(fixture.slotId)).toBe(2);
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
    it('releases every seat and drops the fee with the last item', async () => {
      await auth(
        request(server).delete(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`),
      ).expect(200);

      expect(await slotBooked(fixture.slotId)).toBe(0);
      // An empty booking owes nothing at all, fee included.
      expect(await totals()).toEqual({ subtotal: 0, bookingFee: 0, total: 0 });
      expect(await harness.prisma.ticket.count()).toBe(0);
    });

    it('keeps the fee while another tour remains', async () => {
      const slotId = await secondSlot();

      await auth(
        request(server)
          .post(`/api/v1/admin/bookings/${reference}/items`)
          .send({ slotId, quantity: 1 }),
      ).expect(201);

      await auth(
        request(server).delete(`/api/v1/admin/bookings/${reference}/items/${await itemId()}`),
      ).expect(200);

      expect(await totals()).toEqual({
        subtotal: CATALOGUE_PRICE,
        bookingFee: BOOKING_FEE,
        total: CATALOGUE_PRICE + BOOKING_FEE,
      });
      expect(await slotBooked(fixture.slotId)).toBe(0);
      expect(await slotBooked(slotId)).toBe(1);
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

  describe('under concurrency', () => {
    it('never lets simultaneous edits push a departure past capacity', async () => {
      // 8 free seats; five operators each try to add 2 to their own booking.
      const slotId = await secondSlot(8);

      const references = await Promise.all(
        Array.from({ length: 5 }, async (_, index) => {
          const customer = await harness.prisma.customer.create({
            data: { email: `race${index}@example.com`, fullName: `Racer ${index}` },
          });
          const booking = await harness.prisma.booking.create({
            data: {
              reference: `BK-RACE-${index}`,
              customerId: customer.id,
              status: 'CONFIRMED',
              paymentStatus: 'PAID',
              currency: 'EUR',
              subtotal: 0,
              bookingFee: 0,
              total: 0,
            },
          });
          return booking.reference;
        }),
      );

      const results = await Promise.all(
        references.map((entry) =>
          auth(
            request(server)
              .post(`/api/v1/admin/bookings/${entry}/items`)
              .send({ slotId, quantity: 2 }),
          ).then(
            (response) => response.status,
            () => 500,
          ),
        ),
      );

      const created = results.filter((status) => status === 201).length;

      // 8 seats at 2 each admits exactly four; the fifth must be refused.
      expect(created).toBe(4);
      expect(results.filter((status) => status === 409)).toHaveLength(1);
      expect(await slotBooked(slotId)).toBe(8);
      // And no orphan item was written for the loser.
      expect(await harness.prisma.bookingItem.count({ where: { slotId } })).toBe(4);
    });
  });
});
