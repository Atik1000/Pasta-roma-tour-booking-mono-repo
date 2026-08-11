import Image from 'next/image';

import { SectionHeading } from '@pasta/ui';

/**
 * The photograph every hero on the site now shares.
 *
 * The landing page opens on this image; every other page opened on a gold
 * gradient with a line-drawn skyline behind it, so moving between them looked
 * like moving between two products. One picture, one treatment.
 *
 * It is deliberately the same file as the landing hero rather than a copy: the
 * browser has it cached by the time an inner page is reached, and there is only
 * one asset to swap when the real photography lands.
 */
export const HERO_IMAGE = '/hero-rome-sunset.jpg';

/**
 * The banded page header used by Tours, Locations, My Bookings, the Blog
 * listing and the content pages — heading on the left, photograph behind.
 *
 * Shorter than the landing hero on purpose. That one is the page; this one is
 * a header, and the content below it is what the visitor came for.
 *
 * Pages using this must render `<Navbar overlay />`: the bar sits on top of the
 * image, and the sticky cream bar would otherwise cut a band across the sky.
 */
export function PageHero({
  title,
  description,
  laurels = true,
}: {
  title: string;
  description?: string;
  laurels?: boolean;
}) {
  return (
    <section className="relative isolate overflow-hidden pb-14 pt-36 sm:pt-40">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[62%_center]"
        />

        {/* Same two scrims as the landing hero: one horizontal to carry the
            heading column, one vertical to land the band on the page. */}
        <div className="from-cream-900/85 via-cream-900/50 sm:via-cream-900/40 absolute inset-0 bg-gradient-to-r to-transparent" />
        <div className="from-cream-900/60 absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent" />
        <div className="from-background absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          as="h1"
          align="start"
          tone="inverse"
          title={title}
          description={description}
          laurels={laurels}
        />
      </div>
    </section>
  );
}
