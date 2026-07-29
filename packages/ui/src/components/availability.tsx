'use client';

import type { CalendarDate, ClockTime } from '@pasta/types';
import { formatClockTime, formatDateParts } from '@pasta/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../lib/cn';

export interface DateOption {
  date: CalendarDate;
  /**
   * Binary by design: the "Limited spots" state was struck from the
   * Check Availability mock, so a date is either bookable or not.
   */
  available: boolean;
}

export interface DateStripProps {
  dates: DateOption[];
  value?: CalendarDate;
  onChange: (date: CalendarDate) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  canGoBack?: boolean;
  className?: string;
}

/** The horizontal 7-day rail at the top of Check Availability. */
export function DateStrip({
  dates,
  value,
  onChange,
  onPrevious,
  onNext,
  canGoBack = true,
  className,
}: DateStripProps) {
  const arrow =
    'flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <button
        type="button"
        aria-label="Earlier dates"
        onClick={onPrevious}
        disabled={!canGoBack || !onPrevious}
        className={arrow}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      <div
        role="radiogroup"
        aria-label="Choose a date"
        className="flex flex-1 gap-3 overflow-x-auto pb-1"
      >
        {dates.map((option) => {
          const parts = formatDateParts(option.date);
          const selected = option.date === value;

          return (
            <button
              key={option.date}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!option.available}
              onClick={() => onChange(option.date)}
              className={cn(
                'rounded-card flex min-w-24 flex-1 flex-col items-center gap-0.5 border px-3 py-3 transition-all',
                'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                selected
                  ? 'border-primary bg-accent/40'
                  : 'border-border bg-card hover:border-primary/60',
                !option.available && 'hover:border-border cursor-not-allowed opacity-50',
              )}
            >
              <span className="text-muted-foreground text-xs">{parts.weekday}</span>
              <span
                className={cn(
                  'text-sm font-semibold',
                  selected ? 'text-primary' : 'text-foreground',
                )}
              >
                {parts.month} {parts.day}
              </span>
              <span
                className={cn(
                  'text-xs',
                  option.available ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {option.available ? 'Available' : 'Sold out'}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Later dates"
        onClick={onNext}
        disabled={!onNext}
        className={arrow}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export interface SlotOption {
  id: string;
  time: ClockTime;
  available: boolean;
}

export interface TimeSlotGridProps {
  slots: SlotOption[];
  value?: string;
  onChange: (slotId: string) => void;
  className?: string;
}

/** The radio grid of departure times. Sold-out slots stay visible but disabled. */
export function TimeSlotGrid({ slots, value, onChange, className }: TimeSlotGridProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose a time slot"
      className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}
    >
      {slots.map((slot) => {
        const selected = slot.id === value;

        return (
          <button
            key={slot.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!slot.available}
            onClick={() => onChange(slot.id)}
            className={cn(
              'rounded-card flex items-center justify-between gap-3 border px-4 py-3 text-left transition-all',
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
              selected
                ? 'border-primary bg-accent/40'
                : 'border-border bg-card hover:border-primary/60',
              !slot.available && 'bg-muted/40 hover:border-border cursor-not-allowed opacity-60',
            )}
          >
            <span>
              <span
                className={cn(
                  'block text-sm font-medium',
                  !slot.available && 'text-muted-foreground line-through',
                )}
              >
                {formatClockTime(slot.time)}
              </span>
              <span
                className={cn(
                  'block text-xs',
                  slot.available ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {slot.available ? 'Available' : 'Sold out'}
              </span>
            </span>

            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-primary' : 'border-input',
              )}
            >
              {selected ? <span className="bg-primary size-2.5 rounded-full" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
