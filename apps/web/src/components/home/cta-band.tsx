import Link from 'next/link';

import { Button } from '@pasta/ui';
import { ArrowRight, MapPin } from 'lucide-react';

import { SkylineBackdrop } from '@/components/layout/brand';

/**
 * The closing band.
 *
 * A visitor who has read the whole page is either convinced or gone, so this
 * asks once, plainly, and offers the two things they might want next: the whole
 * catalogue, or the destination list if they have not settled on a city.
 */
export function CtaBand() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(140deg,#7b4b14_0%,#b5751f_45%,#d29a45_100%)]"
      />
      {/* Already absolutely positioned along the bottom edge by default. */}
      <SkylineBackdrop className="text-cream-100/15 -z-10" />

      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        <h2 className="font-display text-balance text-3xl font-semibold text-white sm:text-4xl">
          Your Rome is waiting
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-white/85">
          Pick a tour, choose a date, and we will handle the tickets, the timing and the queue.
        </p>

        {/* Full-width stacked buttons on a phone; side by side from `sm`. */}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="text-brand-700 hover:bg-cream-100 hover:text-brand-800 shadow-elevated bg-white"
          >
            <Link href="/tours">
              Explore all tours
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/50 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
          >
            <Link href="/locations">
              <MapPin aria-hidden />
              Browse destinations
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
