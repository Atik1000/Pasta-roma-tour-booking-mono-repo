import request from 'supertest';
import type { App } from 'supertest/types';

import {
  createHarness,
  resetDatabase,
  seedMinimal,
  type Harness,
  type SeedFixture,
} from './harness';

/** A 1×1 PNG — the smallest thing that survives magic-byte validation. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The catalogue-editing surface behind the admin panel: uploads, galleries,
 * departures and destinations.
 *
 * The rules asserted here are the ones the admin UI states out loud — a time is
 * unique per tour and date, capacity never falls below seats already sold, and
 * a departure with bookings cannot be deleted.
 */
describe('Admin catalogue editing (e2e)', () => {
  let harness: Harness;
  let server: App;
  let fixture: SeedFixture;
  let token: string;

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

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: fixture.adminEmail, password: fixture.adminPassword })
      .expect(200);

    token = login.body.data.accessToken as string;
  });

  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

  describe('uploads', () => {
    it('accepts a real image and returns a URL that serves it', async () => {
      const response = await auth(
        request(server).post('/api/v1/admin/uploads').attach('file', PNG, 'photo.png'),
      ).expect(201);

      expect(response.body.data.mimeType).toBe('image/png');
      expect(response.body.data.url).toMatch(/\/uploads\/[0-9a-f-]{36}\.png$/);
    });

    it('rejects a non-image wearing an image filename', async () => {
      const response = await auth(
        request(server)
          .post('/api/v1/admin/uploads')
          .attach('file', Buffer.from('<?php echo 1; ?>'), {
            filename: 'shell.png',
            contentType: 'image/png',
          }),
      ).expect(400);

      expect(response.body.message).toMatch(/JPG, PNG, WebP and AVIF/);
    });

    it('is closed to anonymous callers', async () => {
      await request(server)
        .post('/api/v1/admin/uploads')
        .attach('file', PNG, 'photo.png')
        .expect(401);
    });
  });

  describe('galleries', () => {
    it('replaces the gallery and makes the first image the cover', async () => {
      await auth(
        request(server)
          .put(`/api/v1/admin/tours/${fixture.tourId}/images`)
          .send({ urls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'] }),
      ).expect(200);

      const detail = await auth(
        request(server).get(`/api/v1/admin/tours/${fixture.tourId}`),
      ).expect(200);

      expect(detail.body.data.gallery).toEqual([
        'https://cdn.test/a.jpg',
        'https://cdn.test/b.jpg',
      ]);

      const cover = await harness.prisma.tourImage.findFirst({
        where: { tourId: fixture.tourId, isCover: true },
      });
      expect(cover?.url).toBe('https://cdn.test/a.jpg');
    });

    it('leaves no orphan rows when the gallery is replaced twice', async () => {
      for (const urls of [
        ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
        ['https://cdn.test/3.jpg'],
      ]) {
        await auth(
          request(server).put(`/api/v1/admin/tours/${fixture.tourId}/images`).send({ urls }),
        ).expect(200);
      }

      const count = await harness.prisma.tourImage.count({ where: { tourId: fixture.tourId } });
      expect(count).toBe(1);
    });

    it('404s for a tour that does not exist', async () => {
      await auth(
        request(server)
          .put('/api/v1/admin/tours/00000000-0000-4000-8000-000000000000/images')
          .send({ urls: [] }),
      ).expect(404);
    });
  });

  describe('departures', () => {
    it('adds a departure and lists it back for its date', async () => {
      const created = await auth(
        request(server)
          .post(`/api/v1/admin/tours/${fixture.tourId}/slots`)
          .send({ date: '2030-07-04', time: '11:30', capacity: 15 }),
      ).expect(201);

      const list = await auth(
        request(server).get(`/api/v1/admin/tours/${fixture.tourId}/slots?date=2030-07-04`),
      ).expect(200);

      // Narrowed by date, so the fixture's own 2030-06-01 departure is absent.
      expect(list.body.data).toEqual([
        { id: created.body.data.id, date: '2030-07-04', time: '11:30', capacity: 15, booked: 0 },
      ]);
    });

    it('lists every departure when no date is given', async () => {
      await auth(
        request(server)
          .post(`/api/v1/admin/tours/${fixture.tourId}/slots`)
          .send({ date: '2030-07-04', time: '11:30', capacity: 15 }),
      ).expect(201);

      const list = await auth(
        request(server).get(`/api/v1/admin/tours/${fixture.tourId}/slots`),
      ).expect(200);

      expect(list.body.data).toHaveLength(2);
      expect(list.body.data.map((row: { date: string }) => row.date)).toEqual([
        '2030-06-01',
        '2030-07-04',
      ]);
    });

    it('refuses a duplicate time on the same date', async () => {
      const payload = { date: '2030-07-04', time: '11:30', capacity: 15 };

      await auth(
        request(server).post(`/api/v1/admin/tours/${fixture.tourId}/slots`).send(payload),
      ).expect(201);

      const clash = await auth(
        request(server).post(`/api/v1/admin/tours/${fixture.tourId}/slots`).send(payload),
      ).expect(409);

      expect(clash.body.error).toBe('DUPLICATE_TIME_SLOT');
    });

    it('allows the same time on a different date', async () => {
      for (const date of ['2030-07-04', '2030-07-05']) {
        await auth(
          request(server)
            .post(`/api/v1/admin/tours/${fixture.tourId}/slots`)
            .send({ date, time: '11:30', capacity: 15 }),
        ).expect(201);
      }
    });

    it('rejects a malformed date or time rather than storing it', async () => {
      for (const payload of [
        { date: '01-06-2030', time: '11:30', capacity: 5 },
        { date: '2030-07-04', time: '25:00', capacity: 5 },
        { date: '2030-07-04', time: '11:30', capacity: -1 },
      ]) {
        await auth(
          request(server).post(`/api/v1/admin/tours/${fixture.tourId}/slots`).send(payload),
        ).expect(422);
      }
    });

    it('will not drop capacity below the seats already sold', async () => {
      await harness.prisma.tourSlot.update({
        where: { id: fixture.slotId },
        data: { booked: 4 },
      });

      const response = await auth(
        request(server)
          .patch(`/api/v1/admin/slots/${fixture.slotId}`)
          .send({ date: '2030-06-01', time: '09:00', capacity: 3 }),
      ).expect(409);

      expect(response.body.message).toMatch(/4 tickets are already booked/);
    });

    it('allows capacity to be raised', async () => {
      await auth(
        request(server)
          .patch(`/api/v1/admin/slots/${fixture.slotId}`)
          .send({ date: '2030-06-01', time: '09:00', capacity: fixture.slotCapacity + 5 }),
      ).expect(200);

      const slot = await harness.prisma.tourSlot.findUnique({ where: { id: fixture.slotId } });
      expect(slot?.capacity).toBe(fixture.slotCapacity + 5);
    });

    it('deletes an empty departure but refuses one with bookings', async () => {
      await harness.prisma.tourSlot.update({
        where: { id: fixture.slotId },
        data: { booked: 1 },
      });

      await auth(request(server).delete(`/api/v1/admin/slots/${fixture.slotId}`)).expect(409);

      await harness.prisma.tourSlot.update({
        where: { id: fixture.slotId },
        data: { booked: 0 },
      });

      await auth(request(server).delete(`/api/v1/admin/slots/${fixture.slotId}`)).expect(200);

      expect(await harness.prisma.tourSlot.count({ where: { id: fixture.slotId } })).toBe(0);
    });
  });

  describe('destinations', () => {
    it('adds a destination with a derived slug', async () => {
      const response = await auth(
        request(server)
          .post('/api/v1/admin/locations')
          .send({ name: 'Milan, Italy', country: 'Italy' }),
      ).expect(201);

      const created = await harness.prisma.location.findUnique({
        where: { id: response.body.data.id },
      });
      expect(created?.slug).toBe('milan-italy');
    });

    it('refuses a destination that already exists', async () => {
      const response = await auth(
        request(server)
          .post('/api/v1/admin/locations')
          .send({ name: 'Rome, Italy', country: 'Italy' }),
      ).expect(409);

      expect(response.body.error).toBe('SLUG_TAKEN');
    });
  });

  describe('tour detail', () => {
    it('returns the editor shape, including drafts', async () => {
      await harness.prisma.tour.update({
        where: { id: fixture.tourId },
        data: { status: 'DRAFT' },
      });

      const response = await auth(
        request(server).get(`/api/v1/admin/tours/${fixture.tourId}`),
      ).expect(200);

      expect(response.body.data).toMatchObject({
        id: fixture.tourId,
        slug: fixture.tourSlug,
        published: false,
        location: 'Rome, Italy',
      });
      expect(Array.isArray(response.body.data.highlights)).toBe(true);
      expect(Array.isArray(response.body.data.plans)).toBe(true);
    });

    it('404s for an unknown tour and 400s for a malformed id', async () => {
      await auth(
        request(server).get('/api/v1/admin/tours/00000000-0000-4000-8000-000000000000'),
      ).expect(404);

      await auth(request(server).get('/api/v1/admin/tours/not-a-uuid')).expect(400);
    });
  });
});
