'use client';

import * as React from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@pasta/ui';
import { ArrowRight, Clock3, Search, ShieldCheck, Star, X } from 'lucide-react';

import { forgetSearch, readRecentSearches, rememberSearch } from '@/lib/recent-searches';

/**
 * The three claims under the search box.
 *
 * They repeat what the cart's assurances promise, deliberately: the objection a
 * traveller has before searching is the same one they have before paying, and
 * meeting it here is what makes the search box feel safe to use.
 */
const TRUST = [
  { icon: ShieldCheck, label: 'Free cancellation', detail: 'up to 24h before' },
  { icon: Clock3, label: 'Instant confirmation', detail: 'e-tickets by email' },
  { icon: Star, label: 'Rated 4.9 / 5', detail: 'by 12,000+ travellers' },
];

/**
 * The hero photograph.
 *
 * `priority` because this is the largest contentful paint on the landing page —
 * lazy-loading it would hand the visitor an empty gold rectangle for the first
 * second. `sizes="100vw"` since it spans the viewport at every breakpoint, so
 * a phone is served a phone-sized crop rather than the full 1825px plate.
 *
 * The scrims are what make the type legible: the photograph is bright on the
 * left, exactly where the headline sits, so a plain overlay would either wash
 * out the sunset or leave the text unreadable. Two gradients instead — one
 * horizontal for the text column, one vertical to land the section on the page
 * background — keep the sky intact while holding contrast well clear of AA.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <Image
        src="/hero-rome-sunset.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[62%_center]"
      />

      <div className="from-cream-900/85 via-cream-900/45 sm:via-cream-900/35 absolute inset-0 bg-gradient-to-r to-transparent sm:to-transparent" />

      {/* The trust strip sits low and left, over the brightest water in the
          frame; the horizontal scrim above has faded to nothing by then. This
          holds that corner down so the small print stays readable.

          This one is dark and stays. The cream gradient that used to sit
          under it — blending the photograph into the page background — is
          gone: it dissolved the bottom of the frame into a band of white
          smoke, so the river and the bridge simply disappeared before the
          section ended. The photograph now runs to the edge and stops, the
          same way the inner page headers do. */}
      <div className="from-cream-900/70 absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t to-transparent" />
    </div>
  );
}

export function Hero() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [recent, setRecent] = React.useState<string[]>([]);

  // Read after mount: local storage does not exist while server-rendering, and
  // reading it during render would make the markup differ from the client's.
  React.useEffect(() => setRecent(readRecentSearches()), []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();

    if (term) {
      setRecent(rememberSearch(term));
    }

    router.push(term ? `/tours?q=${encodeURIComponent(term)}` : '/tours');
  }

  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackdrop />

      {/*
        Sized by viewport height rather than padding, so the photograph gets to
        be a photograph on a laptop instead of a letterbox — but floored in `rem`
        so a short window never crushes the search box, and capped so an iPad
        Pro in portrait does not scroll a full screen before the first tour.
      */}
      <div className="mx-auto flex min-h-[34rem] max-w-7xl flex-col justify-center px-4 pb-16 pt-32 sm:min-h-[38rem] sm:px-6 sm:pb-20 sm:pt-40 lg:min-h-[min(44rem,88vh)] lg:px-8">
        <div className="max-w-2xl">
          <p className="text-brand-200 mb-3 text-sm font-medium tracking-wide drop-shadow">
            Authentic Experiences. Timeless Memories.
          </p>

          {/*
            `text-4xl` at the smallest size: the old `text-5xl` put "Discover"
            and "Rome" on separate lines on a 360px phone and pushed the search
            box below the fold.
          */}
          <h1 className="font-display text-balance text-4xl font-semibold leading-[1.05] text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
            Discover Rome
            <br />
            Like Never Before
          </h1>

          <p className="mt-5 max-w-md text-base text-white/90 drop-shadow sm:mt-6 sm:text-lg">
            Book the best tours and tickets to iconic attractions, hidden gems, and unforgettable
            experiences.
          </p>

          <form onSubmit={submit} className="mt-7 max-w-lg sm:mt-8" role="search">
            <label htmlFor="hero-search" className="sr-only">
              Search tours
            </label>
            <div className="bg-card shadow-elevated flex items-center gap-2 rounded-2xl p-2">
              <span className="text-muted-foreground pl-3">
                <Search className="size-5" aria-hidden />
              </span>
              <input
                id="hero-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tours, cities or landmarks"
                className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {/* Icon-only on a phone, where a labelled button would squeeze the
                  input down to a few characters; labelled from `sm` up. */}
              <Button
                type="submit"
                className="h-11 shrink-0 rounded-xl px-4"
                aria-label="Search tours"
              >
                <Search className="sm:hidden" aria-hidden />
                <span className="hidden sm:inline">Search</span>
              </Button>
            </div>
          </form>

          {recent.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2.5 text-sm text-white/80">Recent searches</p>
              <ul className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <li key={term}>
                    <span className="bg-card/95 inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-sm shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setRecent(rememberSearch(term));
                          router.push(`/tours?q=${encodeURIComponent(term)}`);
                        }}
                        className="text-foreground hover:text-primary focus-visible:outline-ring rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {term}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${term} from recent searches`}
                        onClick={() => setRecent(forgetSearch(term))}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring flex size-6 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            // Only when there is no search history to show — two rows of chips
            // stacked on a phone pushed everything below the fold.
            <div className="mt-7">
              <Button
                asChild
                variant="outline"
                className="border-white/40 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
              >
                <Link href="/tours">
                  Browse all tours
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          )}
        </div>

        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-4 sm:mt-14">
          {TRUST.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex items-center gap-2.5">
              <Icon className="text-brand-200 size-5 shrink-0 drop-shadow" aria-hidden />
              <span className="leading-tight drop-shadow-md">
                <span className="block text-sm font-medium text-white">{label}</span>
                <span className="block text-xs text-white/85">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
