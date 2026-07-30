'use client';

import * as React from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@pasta/ui';
import { formatDateRange } from '@pasta/utils';
import { CalendarDays, ChevronDown } from 'lucide-react';

export interface DashboardRange {
  label: string;
  from: string;
  to: string;
}

/** `YYYY-MM-DD` for a date `daysAgo` before today, in the browser's timezone. */
function isoDay(daysAgo = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The presets, relative to today.
 *
 * These used to be hard-coded to a week in May 2024, which meant the dashboard
 * asked for a range that has nothing in it and then reported the whole database
 * anyway, because nothing was passed to the API at all.
 */
export function presetRanges(): DashboardRange[] {
  return [
    { label: 'Last 7 days', from: isoDay(6), to: isoDay(0) },
    { label: 'Last 30 days', from: isoDay(29), to: isoDay(0) },
    { label: 'Last 90 days', from: isoDay(89), to: isoDay(0) },
    { label: 'Year to date', from: `${new Date().getFullYear()}-01-01`, to: isoDay(0) },
  ];
}

export function defaultRange(): DashboardRange {
  // presetRanges() always returns four entries; the fallback keeps the type
  // honest for `noUncheckedIndexedAccess`.
  return presetRanges()[0] ?? { label: 'Last 7 days', from: isoDay(6), to: isoDay(0) };
}

/**
 * The date-range control in the dashboard header.
 *
 * Every figure on the screen is fetched with the selected range, so changing it
 * refetches rather than just relabelling the button.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (next: DashboardRange) => void;
}) {
  const presets = React.useMemo(presetRanges, []);

  /** A custom bound keeps the range valid: `to` can never precede `from`. */
  function setBound(key: 'from' | 'to', day: string) {
    if (!day) return;
    const next = { ...value, label: 'Custom', [key]: day };
    if (next.to < next.from) {
      if (key === 'from') next.to = day;
      else next.from = day;
    }
    onChange(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="subtle"
          leadingIcon={<CalendarDays aria-hidden />}
          trailingIcon={<ChevronDown aria-hidden />}
        >
          {formatDateRange(value.from, value.to)}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-64">
        {presets.map((range) => (
          <DropdownMenuItem key={range.label} onSelect={() => onChange(range)}>
            {range.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Custom range</DropdownMenuLabel>

        {/* Selecting a date must not close the menu mid-edit. */}
        <div
          className="grid grid-cols-2 gap-2 p-1.5"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Input
            type="date"
            className="h-9"
            aria-label="Range start"
            value={value.from}
            max={value.to}
            onChange={(event) => setBound('from', event.target.value)}
          />
          <Input
            type="date"
            className="h-9"
            aria-label="Range end"
            value={value.to}
            min={value.from}
            onChange={(event) => setBound('to', event.target.value)}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
