'use client';

import { Minus, Plus } from 'lucide-react';

import { cn } from '../lib/cn';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Announced to screen readers, e.g. "Adult tickets". */
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * The −/+ counter used for traveller counts and cart quantities.
 *
 * Clamps to `min`/`max` rather than letting a caller push an invalid value,
 * which is what stops the cart from exceeding a tour's per-booking ticket cap.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  disabled = false,
  size = 'md',
  className,
}: QuantityStepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const buttonSize = size === 'sm' ? 'size-8' : 'size-9';

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className={cn(
          buttonSize,
          'rounded-field border-border bg-card text-foreground flex items-center justify-center border transition-colors',
          'hover:border-primary hover:text-primary',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:hover:border-border disabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <Minus className="size-4" aria-hidden />
      </button>

      <output
        aria-live="polite"
        aria-label={label}
        className={cn(
          'min-w-10 text-center text-sm font-medium tabular-nums',
          size === 'sm' && 'min-w-8',
        )}
      >
        {value}
      </output>

      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className={cn(
          buttonSize,
          'rounded-field border-border bg-card text-foreground flex items-center justify-center border transition-colors',
          'hover:border-primary hover:text-primary',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:hover:border-border disabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
        )}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
