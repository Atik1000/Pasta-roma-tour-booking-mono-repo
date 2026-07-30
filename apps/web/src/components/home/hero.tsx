'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Button, cn } from '@pasta/ui';
import { Search, X } from 'lucide-react';

import { SkylineBackdrop } from '@/components/layout/brand';
import { forgetSearch, readRecentSearches, rememberSearch } from '@/lib/recent-searches';

/**
 * Placeholder for the client's hero photography.
 *
 * The design uses a golden-hour photo of the Tiber and St Peter's. Until those
 * assets exist, a warm gradient plus the skyline motif keeps the composition
 * and the text contrast intact — swap in `next/image` when the photo lands.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#f7e4c4_0%,#e9c48b_38%,#d19a45_70%,#a9660f_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_20%,rgba(255,244,224,.85),transparent_60%)]" />
      <SkylineBackdrop className="text-cream-900/25 h-64" />
      <div className="from-background absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent" />
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
    <section className="relative isolate overflow-hidden pb-16 pt-36 sm:pb-20 sm:pt-44">
      <HeroBackdrop />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-brand-800 mb-3 text-sm font-medium tracking-wide">
            Authentic Experiences. Timeless Memories.
          </p>

          <h1 className="font-display text-cream-900 text-balance text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-7xl">
            Discover Rome
            <br />
            Like Never Before
          </h1>

          <p className="text-cream-800 mt-6 max-w-md text-base sm:text-lg">
            Book the best tours and tickets to iconic attractions, hidden gems, and unforgettable
            experiences.
          </p>

          <form onSubmit={submit} className="mt-8 max-w-lg" role="search">
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
                placeholder="Keyword Search"
                className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <Button
                type="submit"
                size="icon"
                className="size-11 rounded-xl"
                aria-label="Search tours"
              >
                <Search aria-hidden />
              </Button>
            </div>
          </form>

          {recent.length > 0 ? (
            <div className="mt-6">
              <p className="text-cream-800 mb-3 text-sm">Recent Search History</p>
              <ul className="flex flex-wrap gap-2.5">
                {recent.map((term) => (
                  <li key={term}>
                    <span
                      className={cn(
                        'bg-card/95 inline-flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-sm shadow-sm',
                      )}
                    >
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
          ) : null}
        </div>
      </div>
    </section>
  );
}
