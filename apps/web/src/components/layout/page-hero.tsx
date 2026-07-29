import { SectionHeading } from '@pasta/ui';

import { SkylineBackdrop } from './brand';

/**
 * The banded page header used by Tours, My Bookings and the Blog listing —
 * heading on the left, the warm hero treatment bleeding off to the right.
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
    <section className="relative isolate overflow-hidden pb-14 pt-32">
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(105deg,var(--color-cream-100)_0%,var(--color-cream-100)_38%,#f3ddb8_62%,#e3b76f_100%)]" />
        <SkylineBackdrop className="text-cream-900/15 h-44" />
        <div className="from-background absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t to-transparent" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          as="h1"
          align="start"
          title={title}
          description={description}
          laurels={laurels}
        />
      </div>
    </section>
  );
}
