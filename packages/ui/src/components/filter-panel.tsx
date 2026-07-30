'use client';

import * as React from 'react';

import { Filter } from 'lucide-react';

import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './menus';
import { cn } from '../lib/cn';

export interface FilterPanelProps {
  /**
   * How many advanced filters are currently narrowing the list. Shown as a
   * badge on the trigger so an operator can tell at a glance why a table looks
   * emptier than they expect.
   */
  activeCount: number;
  /** Clears every advanced filter. Disabled when none are set. */
  onClear: () => void;
  /** The filter controls themselves. */
  children: React.ReactNode;
  className?: string;
}

/**
 * The "Filters" button the listing designs place beside Reset.
 *
 * The inline bar carries the filters an operator reaches for constantly —
 * search, status, location. This holds the rest: date ranges, amount bounds, and
 * the per-screen extras. They apply as they change rather than behind an Apply
 * button, so the count on the trigger always describes the table below.
 */
export function FilterPanel({ activeCount, onClear, children, className }: FilterPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('relative self-end', className)}
          leadingIcon={<Filter aria-hidden />}
          aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'}
        >
          Filters
          {activeCount > 0 ? (
            <span
              aria-hidden
              className="bg-brand-gradient text-primary-foreground absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
            >
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Advanced filters</h3>
          <Button variant="ghost" size="sm" disabled={activeCount === 0} onClick={onClear}>
            Clear
          </Button>
        </div>

        <div className="flex flex-col gap-4">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export interface FilterRangeProps {
  legend: string;
  children: React.ReactNode;
}

/** A labelled pair of bounds — "From / To", "Min / Max". */
export function FilterRange({ legend, children }: FilterRangeProps) {
  return (
    <fieldset>
      <legend className="text-muted-foreground mb-1.5 text-xs font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </fieldset>
  );
}
