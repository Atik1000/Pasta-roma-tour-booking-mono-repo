import type { CalendarDate, ClockTime, ISODateString } from '@pasta/types';

const UTC = 'UTC';

function toDate(value: Date | ISODateString | CalendarDate): Date {
  return value instanceof Date ? value : new Date(value);
}

/** `2024-05-21` — the storage form for a tour date. */
export function toCalendarDate(value: Date | ISODateString): CalendarDate {
  const date = toDate(value);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `May 21, 2024` */
export function formatDate(value: Date | ISODateString | CalendarDate): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: UTC,
  }).format(toDate(value));
}

/** `Thu, May 23, 2024` */
export function formatDateWithWeekday(value: Date | ISODateString | CalendarDate): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: UTC,
  }).format(toDate(value));
}

/** `{ weekday: 'Thu', month: 'May', day: '23' }` — for the availability date rail. */
export function formatDateParts(value: Date | ISODateString | CalendarDate): {
  weekday: string;
  month: string;
  day: string;
} {
  const date = toDate(value);
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: UTC }).format(date),
    month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: UTC }).format(date),
    day: new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: UTC }).format(date),
  };
}

/** `May 21, 2024 at 10:35 AM` */
export function formatDateTime(value: Date | ISODateString): string {
  const date = toDate(value);
  return `${formatDate(date)} at ${formatTimestamp(date)}`;
}

/** `10:35 AM` from a timestamp. */
export function formatTimestamp(value: Date | ISODateString): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: UTC,
  }).format(toDate(value));
}

/** `09:30` → `09:30 AM` — slot times are stored as plain clock strings. */
export function formatClockTime(time: ClockTime): string {
  const [rawHours = '0', rawMinutes = '00'] = time.split(':');
  const hours = Number.parseInt(rawHours, 10);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${`${displayHours}`.padStart(2, '0')}:${rawMinutes} ${suffix}`;
}

/** `May 21 – May 27, 2024` — the dashboard date-range control. */
export function formatDateRange(from: Date | ISODateString, to: Date | ISODateString): string {
  const start = toDate(from);
  const end = toDate(to);
  const startLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: UTC,
  }).format(start);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const endLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: UTC,
  }).format(end);
  return sameYear
    ? `${startLabel} – ${endLabel}`
    : `${startLabel}, ${start.getUTCFullYear()} – ${endLabel}`;
}

export function addDays(value: Date | ISODateString | CalendarDate, days: number): Date {
  const date = toDate(value);
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Inclusive list of calendar dates, used to build the 7-day availability rail. */
export function eachDayInRange(start: Date | CalendarDate, days: number): CalendarDate[] {
  return Array.from({ length: days }, (_, index) => toCalendarDate(addDays(start, index)));
}

export function isPastDate(value: Date | ISODateString | CalendarDate, now = new Date()): boolean {
  return toDate(value).getTime() < now.getTime();
}

/** `2.5` → `2.5 Hours`; `24` → `1 Day`. Matches the duration labels in the designs. */
export function formatDuration(hours: number): string {
  if (hours >= 24) {
    const days = hours / 24;
    const rounded = Number.isInteger(days) ? days : Math.round(days * 10) / 10;
    return `${rounded} ${rounded === 1 ? 'Day' : 'Days'}`;
  }
  if (hours < 1) {
    return `${Math.round(hours * 60)} mins`;
  }
  const rounded = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'Hour' : 'Hours'}`;
}
