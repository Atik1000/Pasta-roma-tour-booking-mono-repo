'use client';

import * as React from 'react';

import { Button, Checkbox, FormField, Input } from '@pasta/ui';
import { formatClockTime, formatDate } from '@pasta/utils';
import { Plus, X } from 'lucide-react';

/**
 * A repeating run of departures, as the form holds it.
 *
 * Everything is a string because that is what the inputs give back; the dates
 * are expanded from the range only when the schedule is applied.
 */
export interface SlotSchedule {
  times: string[];
  capacity: string;
  from: string;
  to: string;
  /** Days of the week that run, `0` Sunday through `6` Saturday. */
  weekdays: number[];
}

/** Today, as YYYY-MM-DD in the browser's own timezone. */
export function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** The given day shifted by `days`, still as YYYY-MM-DD. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A month of daily 09:00 departures — the shape most tours actually run. */
export function defaultSchedule(): SlotSchedule {
  return {
    times: ['09:00'],
    capacity: '20',
    from: today(),
    to: shiftDay(today(), 29),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };
}

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

/** The API's ceiling on one schedule, mirrored here so the form can say so. */
export const MAX_SCHEDULE_SLOTS = 2000;
const MAX_DAYS = 366;

/**
 * Every date the schedule covers, oldest first.
 *
 * Dates are stepped in UTC and the weekday is read in UTC too, so a browser
 * behind or ahead of the line cannot shift a Saturday departure onto Sunday.
 */
export function scheduleDates(schedule: SlotSchedule): string[] {
  const { from, to, weekdays } = schedule;
  if (!from || !to || to < from || weekdays.length === 0) return [];

  const dates: string[] = [];
  for (let day = from; day <= to && dates.length < MAX_DAYS; day = shiftDay(day, 1)) {
    if (weekdays.includes(new Date(`${day}T00:00:00.000Z`).getUTCDay())) {
      dates.push(day);
    }
  }

  return dates;
}

/** The times worth sending: non-empty, de-duplicated, in clock order. */
export function scheduleTimes(schedule: SlotSchedule): string[] {
  return [...new Set(schedule.times.filter((time) => /^\d{2}:\d{2}$/.test(time)))].sort();
}

/** How many departures applying this schedule would try to create. */
export function scheduleSize(schedule: SlotSchedule): number {
  return scheduleDates(schedule).length * scheduleTimes(schedule).length;
}

/** The reason this schedule cannot be applied, or null when it can. */
export function scheduleProblem(schedule: SlotSchedule): string | null {
  if (scheduleTimes(schedule).length === 0) return 'Add at least one departure time.';
  if (!schedule.from || !schedule.to) return 'Choose the dates this tour runs between.';
  if (schedule.to < schedule.from) return 'The last date is before the first one.';
  if (schedule.weekdays.length === 0) return 'Choose at least one day of the week.';
  if (scheduleDates(schedule).length === 0) return 'No dates fall in that range.';
  if (scheduleSize(schedule) > MAX_SCHEDULE_SLOTS) {
    return `That would create ${scheduleSize(schedule)} departures. Shorten the date range or drop a time.`;
  }
  return null;
}

/**
 * The departures form.
 *
 * Tours were only ever schedulable one date at a time, which is why a new tour
 * reached the public site with nothing to book: filling a month by hand is
 * sixty separate saves. A tour runs at the same times most days, so that is
 * what this collects — times, seats, a date range and the weekdays it skips.
 */
export function ScheduleBuilder({
  value,
  onChange,
  onApply,
  isApplying,
  applyLabel = 'Add these departures',
  footnote,
}: {
  value: SlotSchedule;
  onChange: (next: SlotSchedule) => void;
  /** Omitted while creating a tour — there is nothing to attach departures to yet. */
  onApply?: () => void;
  isApplying?: boolean;
  applyLabel?: string;
  footnote?: React.ReactNode;
}) {
  const dates = scheduleDates(value);
  const times = scheduleTimes(value);
  const problem = scheduleProblem(value);
  const total = dates.length * times.length;

  function patch(changes: Partial<SlotSchedule>) {
    onChange({ ...value, ...changes });
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Departure times</legend>

        <div className="flex flex-wrap items-center gap-2">
          {value.times.map((time, index) => (
            <span key={index} className="flex items-center gap-1">
              <Input
                type="time"
                value={time}
                aria-label={`Departure time ${index + 1}`}
                className="h-9 w-32"
                onChange={(event) => {
                  const next = [...value.times];
                  next[index] = event.target.value;
                  patch({ times: next });
                }}
              />
              {value.times.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Remove departure time ${index + 1}`}
                  onClick={() => patch({ times: value.times.filter((_, i) => i !== index) })}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </span>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            leadingIcon={<Plus aria-hidden />}
            onClick={() => patch({ times: [...value.times, '14:00'] })}
          >
            Add time
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          Every time listed here runs on every date below.
        </p>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Seats per departure" required>
          <Input
            type="number"
            min="1"
            value={value.capacity}
            onChange={(event) => patch({ capacity: event.target.value })}
          />
        </FormField>

        <FormField label="Runs from" required>
          <Input
            type="date"
            value={value.from}
            onChange={(event) => patch({ from: event.target.value })}
          />
        </FormField>

        <FormField label="Until" required>
          <Input
            type="date"
            min={value.from}
            value={value.to}
            onChange={(event) => patch({ to: event.target.value })}
          />
        </FormField>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Days it runs</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {WEEKDAYS.map((day) => (
            <label key={day.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={value.weekdays.includes(day.value)}
                onCheckedChange={(checked) =>
                  patch({
                    weekdays: checked
                      ? [...value.weekdays, day.value]
                      : value.weekdays.filter((entry) => entry !== day.value),
                  })
                }
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-field border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 border p-4">
        <p className="text-sm">
          {problem ? (
            <span className="text-muted-foreground">{problem}</span>
          ) : (
            <>
              <strong className="font-medium">
                {total} {total === 1 ? 'departure' : 'departures'}
              </strong>{' '}
              <span className="text-muted-foreground">
                — {times.map(formatClockTime).join(', ')} on {dates.length}{' '}
                {dates.length === 1 ? 'day' : 'days'}, {formatDate(dates[0] ?? '')} to{' '}
                {formatDate(dates[dates.length - 1] ?? '')}.
              </span>
            </>
          )}
        </p>

        {onApply ? (
          <Button
            type="button"
            disabled={Boolean(problem)}
            isLoading={isApplying}
            onClick={onApply}
          >
            {applyLabel}
          </Button>
        ) : null}
      </div>

      {footnote ? <p className="text-muted-foreground text-xs">{footnote}</p> : null}
    </div>
  );
}
