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
 * Authentication and authorisation.
 *
 * The assertions here are the security promises the product makes: admin data
 * is closed by default, credentials cannot be enumerated, and a stolen refresh
 * token cannot outlive its rotation.
 */
describe('Auth and admin access (e2e)', () => {
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
    fixture = await seedMinimal(harness.prisma);
  });

  async function login() {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: fixture.adminEmail, password: fixture.adminPassword })
      .expect(200);

    return {
      accessToken: response.body.data.accessToken as string,
      refreshCookie: cookieFrom(response.headers, 'prt_refresh') ?? '',
    };
  }

  describe('login', () => {
    it('issues an access token and an httpOnly refresh cookie', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: fixture.adminEmail, password: fixture.adminPassword })
        .expect(200);

      expect(response.body.data.user).toMatchObject({ email: fixture.adminEmail, role: 'ADMIN' });
      expect(response.body.data.accessToken).toEqual(expect.any(String));

      const raw = response.headers['set-cookie'] as unknown as string[];
      const cookie = raw.find((entry) => entry.startsWith('prt_refresh='));
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('gives an identical answer for a wrong password and an unknown address', async () => {
      const wrongPassword = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: fixture.adminEmail, password: 'not-the-password' })
        .expect(401);

      const unknownEmail = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test.local', password: 'not-the-password' })
        .expect(401);

      // Identical wording is what stops this endpoint enumerating accounts.
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('never returns the password hash', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: fixture.adminEmail, password: fixture.adminPassword })
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('$argon2');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('refresh rotation', () => {
    it('rotates the cookie on every use', async () => {
      const { refreshCookie } = await login();

      const response = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);

      expect(cookieFrom(response.headers, 'prt_refresh')).not.toBe(refreshCookie);
    });

    it('treats re-use of a rotated token as theft and kills the family', async () => {
      const { refreshCookie } = await login();

      const rotated = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);
      const newCookie = cookieFrom(rotated.headers, 'prt_refresh') ?? '';

      // An attacker replays the token the legitimate user already spent.
      await request(server).post('/api/v1/auth/refresh').set('Cookie', refreshCookie).expect(401);

      // The legitimate holder's newer token is revoked too — that is the point.
      await request(server).post('/api/v1/auth/refresh').set('Cookie', newCookie).expect(401);
    });

    it('rejects a refresh with no cookie at all', async () => {
      await request(server).post('/api/v1/auth/refresh').expect(401);
    });
  });

  describe('admin authorisation', () => {
    const endpoints = [
      '/api/v1/admin/dashboard/stats',
      '/api/v1/admin/tours',
      '/api/v1/admin/bookings',
      '/api/v1/admin/blogs',
      '/api/v1/admin/payments',
    ];

    it.each(endpoints)('closes %s without a token', async (path) => {
      await request(server).get(path).expect(401);
    });

    it.each(endpoints)('rejects a forged token on %s', async (path) => {
      await request(server).get(path).set('Authorization', 'Bearer not.a.real.token').expect(401);
    });

    it('opens admin data to a signed-in administrator', async () => {
      const { accessToken } = await login();

      const response = await request(server)
        .get('/api/v1/admin/dashboard/stats')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toMatchObject({ activeTours: 1, totalBookings: 0 });
    });

    it('shows drafts to admins that the public API hides', async () => {
      const { accessToken } = await login();

      const adminView = await request(server)
        .get('/api/v1/admin/tours')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const publicView = await request(server).get('/api/v1/tours').expect(200);

      expect(adminView.body.meta.total).toBe(2);
      expect(publicView.body.meta.total).toBe(1);
    });

    it('refuses writes without a token', async () => {
      await request(server).post('/api/v1/admin/tours').send({ title: 'Sneaky' }).expect(401);
      await request(server).delete(`/api/v1/admin/tours/${fixture.tourId}`).expect(401);
    });
  });

  describe('password reset', () => {
    it('answers identically for known and unknown addresses', async () => {
      const known = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: fixture.adminEmail })
        .expect(200);

      const unknown = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'ghost@test.local' })
        .expect(200);

      expect(known.body.data.message).toBe(unknown.body.data.message);
    });

    it('rejects a token that was never issued', async () => {
      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'made-up.token', password: 'BrandNewPassword1' })
        .expect(401);
    });
  });
});
