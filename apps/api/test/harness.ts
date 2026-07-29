import { hash } from '@node-rs/argon2';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { buildValidationPipe } from '../src/common/pipes/validation.pipe';
import { PrismaService } from '../src/database/prisma.service';

import cookieParser from 'cookie-parser';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

/**
 * Boots the real application against the test database.
 *
 * Nothing is mocked: these tests exercise the same guards, pipes, filters and
 * SQL that production runs, which is the only way a booking test can prove
 * seats are actually claimed.
 */
export async function createHarness(): Promise<Harness> {
  // Throttling is disabled for NODE_ENV=test inside the app itself (see
  // ThrottlerModule's `skipIf`), so functional assertions are never throttled.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  // Mirror main.ts: without the prefix and the cookie parser these tests would
  // exercise a different application than the one that ships.
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(buildValidationPipe());
  app.useLogger(false);
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
    },
  };
}

/** Wipes every table. Guarded by `PrismaService` to `NODE_ENV=test`. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.truncateAll();
}

export interface SeedFixture {
  tourId: string;
  tourSlug: string;
  slotId: string;
  slotCapacity: number;
  adminEmail: string;
  adminPassword: string;
}

/**
 * The smallest catalogue a booking test needs: one location, one published
 * tour with a known price and cap, one slot with a known capacity, and one
 * admin. Deliberately tiny so failures point at behaviour, not fixtures.
 */
export async function seedMinimal(
  prisma: PrismaService,
  options: { capacity?: number; maxTicketsPerTour?: number } = {},
): Promise<SeedFixture> {
  const { capacity = 10, maxTicketsPerTour = 6 } = options;

  const location = await prisma.location.create({
    data: { name: 'Rome, Italy', slug: 'rome-italy', country: 'Italy' },
  });

  const tour = await prisma.tour.create({
    data: {
      title: 'Colosseum Underground Tour',
      slug: 'colosseum-underground-tour',
      description: 'A guided walk beneath the arena floor.',
      durationHours: 2.5,
      type: 'WALKING',
      status: 'PUBLISHED',
      locationId: location.id,
      priceAdultEur: 5900,
      priceAdultUsd: 9900,
      maxTicketsPerTour,
      bullets: {
        create: [
          { kind: 'HIGHLIGHT', text: 'Underground access', position: 0 },
          { kind: 'INCLUDED', text: 'Licensed guide', position: 0 },
          { kind: 'GOOD_TO_KNOW', text: 'Bring photo ID', position: 0 },
        ],
      },
      plans: { create: [{ position: 1, title: 'Meet', description: 'Meet your guide.' }] },
      images: { create: [{ url: 'https://example.test/cover.jpg', position: 0, isCover: true }] },
    },
  });

  // A draft tour, so tests can assert the public API hides it.
  await prisma.tour.create({
    data: {
      title: 'Secret Draft Tour',
      slug: 'secret-draft-tour',
      description: 'Not ready for sale yet.',
      durationHours: 2,
      type: 'WALKING',
      status: 'DRAFT',
      locationId: location.id,
      priceAdultEur: 1000,
      priceAdultUsd: 1200,
    },
  });

  const slot = await prisma.tourSlot.create({
    data: {
      tourId: tour.id,
      date: new Date('2030-06-01T00:00:00.000Z'),
      time: '09:00',
      capacity,
    },
  });

  const adminPassword = 'TestPassword123!';
  await prisma.user.create({
    data: {
      email: 'admin@test.local',
      name: 'Test Admin',
      role: 'ADMIN',
      passwordHash: await hash(adminPassword),
    },
  });

  return {
    tourId: tour.id,
    tourSlug: tour.slug,
    slotId: slot.id,
    slotCapacity: capacity,
    adminEmail: 'admin@test.local',
    adminPassword,
  };
}

/** Extracts a cookie value from a supertest response. */
export function cookieFrom(headers: Record<string, unknown>, name: string): string | undefined {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match?.split(';')[0];
}
