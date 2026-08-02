/**
 * Database seed.
 *
 * Produces the exact figures shown on the admin screens so the dashboard,
 * listings and detail pages render with believable data:
 *   • 24 tours (18 published, 6 draft) across 6 locations
 *   • 152 bookings — 98 confirmed, 28 pending, 26 cancelled
 *   • 24 blog posts (18 published, 6 draft) in 5 categories
 *
 * Deterministic: the same seed produces the same database every time.
 *
 *   pnpm --filter @pasta/api db:seed
 */
import { join } from 'node:path';

import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { BLOG_CATEGORIES, BLOG_POSTS, FILLER_TOURS, LOCATIONS, TOURS } from './seed-data';
import { writeSeedImage } from './seed-images';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set to seed the database.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// --- deterministic randomness -------------------------------------------------

/** mulberry32 — small, fast, seeded PRNG. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20240521);
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
const between = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));

// --- fixed reference points ---------------------------------------------------

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Every date is relative to the day the seed runs.
 *
 * This used to be a fixed constant so that successive seeds were byte-identical.
 * That is a real convenience, but it made the catalogue unbookable the moment
 * real time moved past the anchor: departures were generated in the past, the
 * availability endpoint correctly returned nothing, and the booking widget had
 * no date to offer. Determinism is preserved where it matters — the PRNG is
 * seeded, so the *shape* of the data is identical between runs — while the
 * dates track reality.
 */
const TODAY = dateOnly(new Date());

/** How many days of departures each tour gets. */
const SLOT_DAYS = 365;

const FIRST_NAMES = [
  'John',
  'Sarah',
  'David',
  'Emily',
  'Michael',
  'Olivia',
  'James',
  'Sophia',
  'Daniel',
  'Emma',
  'Lucas',
  'Isabella',
  'Marco',
  'Giulia',
  'Thomas',
  'Chloe',
  'Andreas',
  'Marta',
  'Peter',
  'Hannah',
];
const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Brown',
  'Wilson',
  'Davis',
  'Martinez',
  'Anderson',
  'Taylor',
  'Rossi',
  'Bianchi',
  'Müller',
  'Dubois',
  'Nowak',
  'Silva',
  'Novak',
  'Hansen',
];

/**
 * Where placeholder images are written, and the origin they are served from.
 *
 * `UPLOAD_DIR` in the API is resolved against `process.cwd()`, and the seed
 * runs from the same directory, so the two agree.
 */
const UPLOADS_DIR = join(process.cwd(), 'uploads');
const API_ORIGIN = new URL(
  process.env.PUBLIC_API_URL ?? process.env.API_PUBLIC_URL ?? 'http://localhost:4000/api/v1',
).origin;

/**
 * Stable placeholder images — replaced by real uploads through the admin panel.
 *
 * These used to be `images.unsplash.com/photo-<slug>-<n>` URLs built from the
 * tour slug. They look plausible but no such photo ids exist, so every image in
 * a freshly seeded database 404'd and the catalogue rendered as "no image"
 * everywhere. The seed now writes its own files into the directory the API
 * already serves, so they resolve without network access.
 */
const imageUrl = (slug: string, index: number): string =>
  writeSeedImage(UPLOADS_DIR, API_ORIGIN, `${slug}-${index}`);

async function reset(): Promise<void> {
  // Order matters: children before parents.
  await prisma.$transaction([
    prisma.ticket.deleteMany(),
    prisma.bookingItem.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.bookingNote.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.tourSlot.deleteMany(),
    prisma.tourPlan.deleteMany(),
    prisma.tourBullet.deleteMany(),
    prisma.tourImage.deleteMany(),
    prisma.tour.deleteMany(),
    prisma.location.deleteMany(),
    prisma.blogOnCategory.deleteMany(),
    prisma.blog.deleteMany(),
    prisma.blogCategory.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.emailLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.passwordReset.deleteMany(),
    prisma.user.deleteMany(),
    prisma.currency.deleteMany(),
    prisma.setting.deleteMany(),
  ]);
}

async function seedPlatform(): Promise<void> {
  await prisma.currency.createMany({
    data: [
      { code: 'EUR', symbol: '€', rateToEur: 1 },
      { code: 'USD', symbol: '$', rateToEur: 1.08 },
    ],
  });

  await prisma.setting.createMany({
    data: [
      { key: 'booking.feeMinor', value: { amount: 500, currency: 'EUR' } },
      { key: 'booking.pendingExpiryMinutes', value: 30 },
      { key: 'booking.freeCancellationHours', value: 24 },
      {
        key: 'contact',
        value: {
          address: 'Via del Corso, 123, 00186 Rome, Italy',
          email: 'info@pastaromatour.com',
          phone: '+39 06 1234 5678',
          hours: 'Mon – Sun: 9:00 AM – 7:00 PM (CET)',
        },
      },
    ],
  });
}

async function seedUsers(): Promise<{ adminId: string; editorId: string }> {
  const passwordHash = await hash('ChangeMe123!');

  const admin = await prisma.user.create({
    data: {
      email: 'admin@pastaromatour.com',
      name: 'Admin User',
      role: 'ADMIN',
      passwordHash,
      lastLoginAt: TODAY,
    },
  });

  const editor = await prisma.user.create({
    data: {
      email: 'editor@pastaromatour.com',
      name: 'Isabella Rossi',
      role: 'EDITOR',
      passwordHash,
    },
  });

  return { adminId: admin.id, editorId: editor.id };
}

async function seedCatalogue(): Promise<void> {
  await prisma.location.createMany({
    data: LOCATIONS.map((location) => ({
      name: location.name,
      slug: location.slug,
      country: location.country,
      heroImage: imageUrl(location.slug, 1),
    })),
  });

  const locations = await prisma.location.findMany();
  const locationBySlug = new Map(locations.map((location) => [location.slug, location.id]));

  const curated = TOURS.map((tour, index) => ({ ...tour, sortOrder: index }));

  // Fill the catalogue out to 24 tours using the same shape as the curated ones.
  const filler = FILLER_TOURS.map((entry, index) => {
    const slug = entry.title
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return {
      title: entry.title,
      slug,
      description: `${entry.title} — a guided experience with a licensed local expert, priority access where available, and small-group attention throughout.`,
      durationHours: entry.hours,
      type: entry.type,
      location: entry.location,
      priceEur: entry.eur,
      priceUsd: Math.round((entry.eur * 1.15) / 100) * 100,
      // 12 published here + 6 curated published = the 18 the admin screen shows.
      status: (index < 12 ? 'PUBLISHED' : 'DRAFT') as 'PUBLISHED' | 'DRAFT',
      maxTickets: 10,
      meetingPointTitle: 'Central meeting point',
      meetingPointAddress: 'Details are sent with your confirmation email.',
      images: [slug],
      highlights: [
        'Licensed local guide',
        'Small-group experience',
        'Priority access where available',
      ],
      included: ['Entrance tickets where applicable', 'Professional guide', 'All taxes and fees'],
      goodToKnow: ['Arrive 15 minutes early', 'Comfortable shoes recommended'],
      plans: [
        { title: 'Meet your guide', description: 'Gather at the meeting point.' },
        { title: 'The experience', description: 'Explore the highlights with your guide.' },
        { title: 'Farewell', description: 'Tour ends near the city centre.' },
      ],
      times: entry.hours >= 8 ? ['07:30'] : ['09:00', '11:30', '14:00', '16:30'],
      capacity: entry.hours >= 8 ? 16 : 20,
      sortOrder: TOURS.length + index,
    };
  });

  for (const tour of [...curated, ...filler]) {
    const locationId = locationBySlug.get(tour.location);
    if (!locationId) throw new Error(`Unknown location slug: ${tour.location}`);

    await prisma.tour.create({
      data: {
        title: tour.title,
        slug: tour.slug,
        description: tour.description,
        durationHours: tour.durationHours,
        type: tour.type,
        status: tour.status,
        locationId,
        priceAdultEur: tour.priceEur,
        priceAdultUsd: tour.priceUsd,
        maxTicketsPerTour: tour.maxTickets,
        isBestseller: 'isBestseller' in tour ? Boolean(tour.isBestseller) : false,
        sortOrder: tour.sortOrder,
        meetingPointTitle: tour.meetingPointTitle,
        meetingPointAddress: tour.meetingPointAddress,
        images: {
          create: tour.images.map((slug, index) => ({
            url: imageUrl(slug, index + 1),
            alt: `${tour.title} — image ${index + 1}`,
            position: index,
            isCover: index === 0,
          })),
        },
        bullets: {
          create: [
            ...tour.highlights.map((text, position) => ({
              kind: 'HIGHLIGHT' as const,
              text,
              position,
            })),
            ...tour.included.map((text, position) => ({
              kind: 'INCLUDED' as const,
              text,
              position,
            })),
            ...tour.goodToKnow.map((text, position) => ({
              kind: 'GOOD_TO_KNOW' as const,
              text,
              position,
            })),
          ],
        },
        plans: {
          create: tour.plans.map((plan, index) => ({
            position: index + 1,
            title: plan.title,
            description: plan.description,
          })),
        },
        // A year of availability, starting a week back so the admin screens
        // have both past and future departures. Generous on purpose: a demo
        // environment should not run out of bookable dates in a few months.
        slots: {
          create: Array.from({ length: SLOT_DAYS }, (_, dayOffset) =>
            tour.times.map((time) => ({
              date: dateOnly(addDays(TODAY, dayOffset - 7)),
              time,
              capacity: tour.capacity,
            })),
          ).flat(),
        },
      },
    });
  }
}

async function seedBlogs(editorId: string): Promise<void> {
  await prisma.blogCategory.createMany({ data: [...BLOG_CATEGORIES] });
  const categories = await prisma.blogCategory.findMany();
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));

  const extras = Array.from({ length: 24 - BLOG_POSTS.length }, (_, index) => {
    const number = index + 1;
    const title = `Rome Travel Notes, Volume ${number}`;
    return {
      title,
      slug: `rome-travel-notes-volume-${number}`,
      categories: [pick(BLOG_CATEGORIES).slug],
      status: (index < 12 ? 'PUBLISHED' : 'DRAFT') as 'PUBLISHED' | 'DRAFT',
      content: `Notes, recommendations and small discoveries from our guides in Rome.\n\n## What we loved this month\n\nQuiet mornings at the Aventine keyhole, and the first tables outside in Monti.\n\n## Where to eat\n\nA short list of trattorias that still write the menu by hand.`,
    };
  });

  const posts = [...BLOG_POSTS, ...extras];

  for (const [index, post] of posts.entries()) {
    await prisma.blog.create({
      data: {
        title: post.title,
        slug: post.slug,
        content: post.content,
        status: post.status,
        coverImage: imageUrl(post.slug, 1),
        publishedAt: post.status === 'PUBLISHED' ? addDays(TODAY, -(index + 1)) : null,
        metaTitle: post.title,
        metaDescription: `${post.title} — insider tips and travel guides from Pasta Roma Tour.`,
        keywords: ['rome', 'italy', 'travel', 'tours'],
        authorId: editorId,
        categories: {
          create: post.categories
            .map((slug) => categoryBySlug.get(slug))
            .filter((id): id is string => Boolean(id))
            .map((categoryId) => ({ categoryId })),
        },
      },
    });
  }
}

/** 152 bookings: 98 confirmed, 28 pending, 26 cancelled — matching the admin KPIs. */
async function seedBookings(adminId: string): Promise<void> {
  const bookableSlots = await prisma.tourSlot.findMany({
    where: { tour: { status: 'PUBLISHED' } },
    include: { tour: { select: { id: true, title: true, priceAdultEur: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });

  if (bookableSlots.length === 0) throw new Error('No bookable slots were created.');

  const plan: { status: 'CONFIRMED' | 'PENDING' | 'CANCELLED'; count: number }[] = [
    { status: 'CONFIRMED', count: 98 },
    { status: 'PENDING', count: 28 },
    { status: 'CANCELLED', count: 26 },
  ];

  const bookingFee = 500;
  let sequence = 500;

  for (const { status, count } of plan) {
    for (let index = 0; index < count; index += 1) {
      sequence += 1;
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${sequence}@example.com`;

      const customer = await prisma.customer.create({
        data: { email, fullName: `${firstName} ${lastName}` },
      });

      const itemCount = between(1, 3);
      const chosen = Array.from({ length: itemCount }, () => pick(bookableSlots));
      const unique = chosen.filter(
        (slot, position) => chosen.findIndex((other) => other.id === slot.id) === position,
      );

      const items = unique.map((slot) => {
        const quantity = between(1, 4);
        const unitPrice = slot.tour.priceAdultEur;
        return {
          slot,
          quantity,
          unitPrice,
          amount: unitPrice * quantity,
        };
      });

      const subtotal = items.reduce((total, item) => total + item.amount, 0);
      const bookedAt = addDays(TODAY, -between(0, 60));

      const paymentStatus =
        status === 'CONFIRMED' ? 'PAID' : status === 'PENDING' ? 'PENDING' : 'REFUNDED';

      const booking = await prisma.booking.create({
        data: {
          reference: `BK-2024-${sequence}`,
          customerId: customer.id,
          status,
          paymentStatus,
          currency: 'EUR',
          subtotal,
          bookingFee,
          total: subtotal + bookingFee,
          bookedAt,
          cancelledAt: status === 'CANCELLED' ? addDays(bookedAt, 1) : null,
          // Relative to seeding time, not to the anchored booking date: an
          // expiry in the past would be swept away by the expire-pending cron
          // the moment the API starts.
          expiresAt: status === 'PENDING' ? new Date(Date.now() + 7 * 86_400_000) : null,
          items: {
            create: items.map((item) => ({
              tourId: item.slot.tour.id,
              slotId: item.slot.id,
              tourTitle: item.slot.tour.title,
              date: item.slot.date,
              time: item.slot.time,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
              tickets: {
                create: Array.from({ length: item.quantity }, (_, ticketIndex) => ({
                  holderFirstName: pick(FIRST_NAMES),
                  holderLastName: lastName,
                  code: `TK-${sequence}-${item.slot.id.slice(0, 4)}-${ticketIndex + 1}`,
                })),
              },
            })),
          },
        },
      });

      // Confirmed and cancelled bookings both went through payment.
      if (status !== 'PENDING') {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            method: pick(['CARD', 'PAYPAL', 'APPLE_PAY'] as const),
            status: paymentStatus,
            amount: subtotal + bookingFee,
            currency: 'EUR',
            transactionId: `txn_${booking.id.replace(/-/g, '').slice(0, 16)}`,
            paidAt: bookedAt,
            refundedAt: status === 'CANCELLED' ? addDays(bookedAt, 1) : null,
            refundedAmount: status === 'CANCELLED' ? subtotal + bookingFee : 0,
          },
        });
      }

      // Only live bookings hold seats.
      if (status !== 'CANCELLED') {
        for (const item of items) {
          await prisma.tourSlot.update({
            where: { id: item.slot.id },
            data: { booked: { increment: item.quantity } },
          });
        }
      }

      if (status === 'CANCELLED' && index % 5 === 0) {
        await prisma.bookingNote.create({
          data: {
            bookingId: booking.id,
            authorId: adminId,
            body: 'Customer requested cancellation by email. Refund issued in full.',
          },
        });
      }
    }
  }
}

async function main(): Promise<void> {
  console.info('Resetting database…');
  await reset();

  console.info('Seeding platform settings and currencies…');
  await seedPlatform();

  console.info('Seeding users…');
  const { adminId, editorId } = await seedUsers();

  console.info('Seeding locations, tours, availability…');
  await seedCatalogue();

  console.info('Seeding blog content…');
  await seedBlogs(editorId);

  console.info('Seeding bookings, tickets and payments…');
  await seedBookings(adminId);

  const [tours, published, slots, bookings, blogs] = await Promise.all([
    prisma.tour.count(),
    prisma.tour.count({ where: { status: 'PUBLISHED' } }),
    prisma.tourSlot.count(),
    prisma.booking.count(),
    prisma.blog.count(),
  ]);

  console.info(
    `Done. ${tours} tours (${published} published), ${slots} slots, ${bookings} bookings, ${blogs} blog posts.`,
  );
  console.info('Admin login: admin@pastaromatour.com / ChangeMe123!');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
