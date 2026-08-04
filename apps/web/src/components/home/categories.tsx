import Link from 'next/link';

import { SectionHeading } from '@pasta/ui';
import { Bus, Footprints, Landmark, Sparkles, UtensilsCrossed, Sun } from 'lucide-react';

/**
 * The six kinds of experience the catalogue is built from.
 *
 * These link to `?type=`, a real filter on the tours endpoint — they used to
 * have to be a free-text search for the word "Museum", which matched any tour
 * that merely mentioned one and missed the museum tours that did not say so in
 * their description. The values are the `TourType` enum; keep them in step.
 */
const CATEGORIES = [
  {
    type: 'WALKING',
    label: 'Walking Tours',
    description: 'See the city at street level',
    icon: Footprints,
  },
  {
    type: 'MUSEUM',
    label: 'Museums & Galleries',
    description: 'Skip the line, not the art',
    icon: Landmark,
  },
  {
    type: 'FOOD',
    label: 'Food & Wine',
    description: 'Eat the way Romans do',
    icon: UtensilsCrossed,
  },
  {
    type: 'DAY_TRIP',
    label: 'Day Trips',
    description: 'Beyond the city walls',
    icon: Sun,
  },
  { type: 'BUS', label: 'Bus Tours', description: 'Cover more, walk less', icon: Bus },
  {
    type: 'PRIVATE',
    label: 'Private Tours',
    description: 'Your guide, your pace',
    icon: Sparkles,
  },
] as const;

export function Categories() {
  return (
    <section className="bg-cream-100 border-border border-y">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <SectionHeading
          eyebrow="What to do"
          title="Browse by Category"
          description="However you like to travel, there is a way to see Rome that suits it."
        />

        {/*
          Two across on the smallest phones rather than one: these tiles are
          short, and a single column turned six of them into a scroll of its
          own before the visitor reached anything else.
        */}
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 lg:gap-5">
          {CATEGORIES.map(({ type, label, description, icon: Icon }) => (
            <li key={type}>
              <Link
                href={`/tours?type=${type}`}
                className="rounded-card border-border bg-card shadow-card hover:border-primary/40 hover:shadow-elevated focus-visible:outline-ring group flex h-full items-center gap-3 border p-4 transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 sm:gap-4 sm:p-5"
              >
                <span className="bg-brand-gradient text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full shadow-sm sm:size-12">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="group-hover:text-primary block font-medium transition-colors">
                    {label}
                  </span>
                  <span className="text-muted-foreground block text-xs sm:text-sm">
                    {description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
