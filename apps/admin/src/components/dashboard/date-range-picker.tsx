'use client';

import * as React from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@pasta/ui';
import { formatDateRange } from '@pasta/utils';
import { CalendarDays, ChevronDown } from 'lucide-react';

interface DateRange {
  label: string;
  from: string;
  to: string;
}

const DEFAULT_RANGE: DateRange = { label: 'Last 7 days', from: '2024-05-21', to: '2024-05-27' };

const RANGES: DateRange[] = [
  DEFAULT_RANGE,
  { label: 'Last 30 days', from: '2024-04-28', to: '2024-05-27' },
  { label: 'This quarter', from: '2024-04-01', to: '2024-05-27' },
  { label: 'Year to date', from: '2024-01-01', to: '2024-05-27' },
];

/** The date-range control in the dashboard header. */
export function DateRangePicker() {
  const [selected, setSelected] = React.useState<DateRange>(DEFAULT_RANGE);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="subtle"
          leadingIcon={<CalendarDays aria-hidden />}
          trailingIcon={<ChevronDown aria-hidden />}
        >
          {formatDateRange(selected.from, selected.to)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {RANGES.map((range) => (
          <DropdownMenuItem key={range.label} onSelect={() => setSelected(range)}>
            {range.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
