'use client';

import * as React from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pasta/ui';
import { MapPin, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';

import { browserApi } from '@/lib/browser-api';

const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'duration', label: 'Duration' },
] as const;

const ALL_LOCATIONS = 'all';

/**
 * Filter bar for the tours listing.
 *
 * State lives in the URL, so a filtered listing is shareable, survives a
 * refresh, and is rendered on the server rather than after hydration.
 */
export function TourFilters() {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = React.useState(params.get('q') ?? '');
  const [locations, setLocations] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void browserApi.locations
      .list()
      .then((rows) => {
        if (!cancelled)
          setLocations(rows.filter((row) => row.tourCount > 0).map((row) => row.name));
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const location = params.get('location') ?? ALL_LOCATIONS;
  const sort = params.get('sort') ?? 'popular';
  const hasFilters = Boolean(params.get('q') ?? params.get('location') ?? params.get('sort'));

  function apply(overrides: Record<string, string | undefined> = {}) {
    const next = new URLSearchParams(params.toString());
    const values = { q: query.trim() || undefined, ...overrides };

    for (const [key, value] of Object.entries(values)) {
      if (!value || value === ALL_LOCATIONS) next.delete(key);
      else next.set(key, value);
    }

    // Any filter change returns to the first page.
    next.delete('page');
    router.push(next.size > 0 ? `/tours?${next.toString()}` : '/tours');
  }

  return (
    <div className="rounded-card border-border bg-card shadow-card border p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
        className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]"
      >
        <div>
          <label htmlFor="tour-search" className="sr-only">
            Search tours
          </label>
          <Input
            id="tour-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tours..."
            leadingIcon={<Search aria-hidden />}
          />
        </div>

        <div className="lg:w-56">
          <label htmlFor="tour-location" className="sr-only">
            Location
          </label>
          <Select value={location} onValueChange={(value) => apply({ location: value })}>
            <SelectTrigger id="tour-location" leadingIcon={<MapPin aria-hidden />}>
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LOCATIONS}>All Locations</SelectItem>
              {locations.map((entry: string) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="lg:w-56">
          <label htmlFor="tour-sort" className="sr-only">
            Sort by
          </label>
          <Select value={sort} onValueChange={(value) => apply({ sort: value })}>
            <SelectTrigger id="tour-sort" leadingIcon={<SlidersHorizontal aria-hidden />}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  Sort by: {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" leadingIcon={<SlidersHorizontal aria-hidden />}>
          Apply Filters
        </Button>
      </form>

      {hasFilters ? (
        <div className="mt-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<RotateCcw aria-hidden />}
            onClick={() => {
              setQuery('');
              router.push('/tours');
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
