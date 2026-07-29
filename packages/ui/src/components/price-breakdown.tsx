import * as React from 'react';

import type { CurrencyCode } from '@pasta/types';
import { formatMoney } from '@pasta/utils';

import { cn } from '../lib/cn';

export interface PriceLine {
  label: React.ReactNode;
  amountMinor: number;
  /** Rendered muted, for sub-lines like "2 Adult Tickets". */
  muted?: boolean;
}

export interface PriceBreakdownProps {
  lines: PriceLine[];
  totalMinor: number;
  currency?: CurrencyCode;
  totalLabel?: string;
  /** Small print under the total, e.g. "All prices in EUR". */
  note?: React.ReactNode;
  className?: string;
}

/**
 * Line items + total, used by the cart summary, the checkout summary, the
 * availability sidebar and the admin booking detail. One implementation means
 * the arithmetic is presented identically everywhere.
 */
export function PriceBreakdown({
  lines,
  totalMinor,
  currency = 'EUR',
  totalLabel = 'Total',
  note,
  className,
}: PriceBreakdownProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <dl className="flex flex-col gap-2.5">
        {lines.map((line, index) => (
          <div key={index} className="flex items-baseline justify-between gap-4 text-sm">
            <dt className={cn(line.muted ? 'text-muted-foreground' : 'text-foreground')}>
              {line.label}
            </dt>
            <dd
              className={cn(
                'shrink-0 tabular-nums',
                line.muted ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {formatMoney(line.amountMinor, currency)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-border flex items-baseline justify-between gap-4 border-t pt-3">
        <span className="font-medium">{totalLabel}</span>
        <span className="font-display text-primary text-2xl font-semibold tabular-nums">
          {formatMoney(totalMinor, currency)}
        </span>
      </div>

      {note ? <p className="text-muted-foreground text-right text-xs">{note}</p> : null}
    </div>
  );
}
