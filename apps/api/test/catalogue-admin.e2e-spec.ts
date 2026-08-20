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
 * The catalogue-editing surface behind the admin panel: uploads, galleries and
 * destinations.
 *
 * The departures suite that used to sit here went with the feature — tours run
 * on demand, so there is no schedule to edit and nothing to sell out of.
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
