/**
 * Redraws the seed's placeholder images, without touching the database.
 *
 *   pnpm --filter @pasta/api db:images
 *
 * `db:seed` also draws them, but it resets every table first — no use to
 * someone who only wants the pictures to stop looking identical and would like
 * to keep the bookings they have been clicking through. The files are written
 * to the same paths the rows already point at, so a refresh is a hard reload
 * in the browser.
 *
 * Rows pointing at real uploads are left alone: only URLs under the seed's own
 * subdirectory are redrawn.
 */
import { join } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { SEED_IMAGE_SUBDIR, writeSeedImage } from './seed-images';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set to refresh the seed images.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const UPLOADS_DIR = join(process.cwd(), 'uploads');

const API_ORIGIN = new URL(
  process.env.PUBLIC_API_URL ?? process.env.API_PUBLIC_URL ?? 'http://localhost:4000/api/v1',
).origin;

/** `.../uploads/seed/colosseum-arena-1.png` → `colosseum-arena-1`. */
function seedImageName(url: string | null): string | null {
  if (!url) return null;

  const match = new RegExp(`/uploads/${SEED_IMAGE_SUBDIR}/([^/]+)\\.png$`).exec(url);
  return match?.[1] ?? null;
}

async function main(): Promise<void> {
  const [locations, tourImages, blogs] = await Promise.all([
    prisma.location.findMany({ select: { heroImage: true } }),
    prisma.tourImage.findMany({ select: { url: true } }),
    prisma.blog.findMany({ select: { coverImage: true } }),
  ]);

  const names = [
    ...locations.map((row) => row.heroImage),
    ...tourImages.map((row) => row.url),
    ...blogs.map((row) => row.coverImage),
  ]
    .map(seedImageName)
    .filter((name): name is string => name !== null);

  // `writeSeedImage` de-duplicates within a run, so a name shared by several
  // rows is only encoded once.
  for (const name of names) {
    writeSeedImage(UPLOADS_DIR, API_ORIGIN, name);
  }

  console.log(`Redrew ${new Set(names).size} placeholder images in ${UPLOADS_DIR}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
