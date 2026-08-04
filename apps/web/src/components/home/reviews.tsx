import { SectionHeading } from '@pasta/ui';
import { Quote, Star } from 'lucide-react';

export interface Review {
  quote: string;
  author: string;
  /** Where they are from — shown under the name. */
  origin: string;
  /** Which tour they took. */
  tour: string;
  rating: number;
}

/**
 * PLACEHOLDER COPY — REPLACE BEFORE THIS PAGE GOES LIVE.
 *
 * These are not real customers and nobody said these words. They exist so the
 * section can be laid out and reviewed; publishing invented testimonials as
 * genuine ones misleads travellers, and in the EU it is also unlawful under the
 * Unfair Commercial Practices Directive, which requires that a trader showing
 * consumer reviews only present ones it has taken reasonable steps to verify.
 *
 * Swap this array for real reviews — pass them in as the `reviews` prop from
 * whatever the business actually collects, whether that is TripAdvisor, Google
 * or a `reviews` table of its own. The component takes the data; it does not
 * care where it came from.
 */
const SAMPLE_REVIEWS: Review[] = [
  {
    quote:
      'Our guide knew every corner of the Forum and made two thousand years of history feel like gossip about the neighbours. Worth every euro.',
    author: 'Sample review',
    origin: 'Placeholder — replace with a real one',
    tour: 'Colosseum & Roman Forum',
    rating: 5,
  },
  {
    quote:
      'Booked the night before, tickets were in my inbox in seconds, and we walked straight past a queue that must have been an hour long.',
    author: 'Sample review',
    origin: 'Placeholder — replace with a real one',
    tour: 'Vatican Museums & Sistine Chapel',
    rating: 5,
  },
  {
    quote:
      'The food tour ruined us for every other meal on the trip. Six stops, nothing touristy, and the guide argued with a cheesemonger on our behalf.',
    author: 'Sample review',
    origin: 'Placeholder — replace with a real one',
    tour: 'Trastevere Food & Wine Walk',
    rating: 5,
  },
];

export function Reviews({ reviews = SAMPLE_REVIEWS }: { reviews?: Review[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="bg-cream-100 border-border border-y">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="Traveller stories"
          title="What Our Travellers Say"
          description="The part of the trip people still talk about when they get home."
        />

        {/*
          A scroll-snap row on phones and a grid from `md` up — three quote
          cards stacked vertically on a phone is a very long way to scroll past
          something nobody reads twice.
        */}
        <ul className="scrollbar-none -mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0">
          {reviews.map((review) => (
            <li
              key={`${review.author}-${review.tour}`}
              className="w-[85%] shrink-0 snap-start sm:w-[60%] md:w-auto"
            >
              <figure className="rounded-card border-border bg-card shadow-card flex h-full flex-col gap-4 border p-6">
                <Quote className="text-primary/30 size-8 shrink-0" aria-hidden />

                <blockquote className="flex-1 text-sm leading-relaxed">
                  &ldquo;{review.quote}&rdquo;
                </blockquote>

                <div
                  className="flex items-center gap-0.5"
                  aria-label={`Rated ${review.rating} out of 5`}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      aria-hidden
                      className={
                        index < review.rating
                          ? 'fill-primary text-primary size-4'
                          : 'text-cream-400 size-4'
                      }
                    />
                  ))}
                </div>

                <figcaption className="border-border border-t pt-4">
                  <span className="block text-sm font-medium">{review.author}</span>
                  <span className="text-muted-foreground block text-xs">{review.origin}</span>
                  <span className="text-primary mt-1 block text-xs">{review.tour}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
