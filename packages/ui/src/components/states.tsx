import * as React from 'react';

import { AlertTriangle, Inbox } from 'lucide-react';

import { cn } from '../lib/cn';
import { Button } from './button';

export interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void } | React.ReactNode;
  className?: string;
}

/** Shown when a list has no results — every table and grid uses this. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full [&_svg]:size-6">
        {icon ?? <Inbox aria-hidden />}
      </span>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description ? <p className="text-muted-foreground max-w-sm text-sm">{description}</p> : null}
      {action ? (
        <div className="mt-2">
          {React.isValidElement(action) ? (
            action
          ) : (
            <Button
              variant="outline"
              onClick={(action as { label: string; onClick: () => void }).onClick}
            >
              {(action as { label: string; onClick: () => void }).label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

/** Shown when a query fails. Pairs with TanStack Query's `isError`. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this right now. Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <span className="bg-danger-soft text-danger flex size-14 items-center justify-center rounded-full [&_svg]:size-6">
        <AlertTriangle aria-hidden />
      </span>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /**
   * Descriptive subline under the value — "All time tours", "64.5% of total".
   *
   * Not to be confused with the percentage *deltas* ("+12.5% vs last week")
   * that the client struck from the dashboard: those compared periods, these
   * just say what the number counts. The dashboard passes none; the Tours,
   * Bookings and Blogs screens do, as their designs show.
   */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** Background tone of the icon bubble. */
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

/** KPI tile used across the admin screens. */
export function StatCard({ label, value, hint, icon, tone = 'brand', className }: StatCardProps) {
  const tones = {
    brand: 'bg-accent text-accent-foreground',
    success: 'bg-success-soft text-success-foreground',
    warning: 'bg-warning-soft text-warning-foreground',
    danger: 'bg-danger-soft text-danger-foreground',
    info: 'bg-info-soft text-info-foreground',
  } as const;

  return (
    <div
      className={cn(
        // `min-w-0` so a long value cannot widen the card past its grid track.
        // Without it the track's automatic minimum is the value's own width, a
        // figure like "€28,319.00" pushes the whole row wider than the page,
        // and the last card is clipped at the edge.
        'rounded-card border-border bg-card shadow-card flex min-w-0 items-center gap-4 border p-5',
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full [&_svg]:size-5',
            tones[tone],
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="text-muted-foreground block truncate text-sm">{label}</span>
        <span className="block text-2xl font-semibold tabular-nums">{value}</span>
        {hint ? (
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">{hint}</span>
        ) : null}
      </span>
    </div>
  );
}
