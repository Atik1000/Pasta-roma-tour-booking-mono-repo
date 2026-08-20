-- Remove departures.
--
-- Tours are booked on demand rather than on a schedule: there is no date, no
-- time and no per-departure seat count anywhere in the product any more, so
-- `tour_slots` and every column pointing at it go with them.
--
-- The date and time on `booking_items` are dropped too. They only ever
-- described which departure the line was for, and past bookings keep the
-- record that matters — tour, quantity, price and ticket holders.

-- Carts are session-scoped and expire in a fortnight, so the in-flight ones are
-- emptied rather than migrated. The alternative — collapsing several departures
-- of one tour into a single line — would silently change what a shopper has in
-- their basket while they are still shopping. An empty cart is the honest
-- outcome, and the new unique constraint below then applies to a clean table.
DELETE FROM "cart_items";

ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "cart_items_slotId_fkey";
DROP INDEX IF EXISTS "cart_items_cartId_slotId_key";
ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "slotId";

CREATE UNIQUE INDEX "cart_items_cartId_tourId_key" ON "cart_items"("cartId", "tourId");

-- The date and time are about to go. Before they do, every existing booking
-- gets a note recording when its tours were scheduled, so support can still
-- answer "when was I booked in?" for a customer who booked under the old
-- system. One note per booking rather than one per line, and written with a
-- NULL author because no member of staff wrote it.
--
-- This runs unconditionally rather than only for non-demo bookings: telling
-- real customers from seeded ones means matching on `@example.com`, and a
-- seed-data assumption has no business being frozen into schema history. A
-- surplus note on a demo booking costs nothing.
INSERT INTO "booking_notes" ("id", "bookingId", "authorId", "body", "createdAt")
SELECT
  gen_random_uuid(),
  bi."bookingId",
  NULL,
  'Scheduled departures, archived when departures were removed from the product: '
    || string_agg(bi."tourTitle" || ' — ' || to_char(bi."date", 'YYYY-MM-DD') || ' at ' || bi."time", '; ' ORDER BY bi."date", bi."time")
    || '.',
  NOW()
FROM "booking_items" bi
GROUP BY bi."bookingId";

ALTER TABLE "booking_items" DROP CONSTRAINT IF EXISTS "booking_items_slotId_fkey";
DROP INDEX IF EXISTS "booking_items_slotId_idx";
ALTER TABLE "booking_items" DROP COLUMN IF EXISTS "slotId";
ALTER TABLE "booking_items" DROP COLUMN IF EXISTS "date";
ALTER TABLE "booking_items" DROP COLUMN IF EXISTS "time";

DROP TABLE IF EXISTS "tour_slots";
