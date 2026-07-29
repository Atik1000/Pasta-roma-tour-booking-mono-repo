import * as React from 'react';

import { cn } from '../lib/cn';

/** Shimmering placeholder used by every list and detail screen while loading. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-field bg-[linear-gradient(90deg,var(--color-muted)_25%,var(--color-surface-muted)_37%,var(--color-muted)_63%)] bg-[length:400%_100%]',
        className,
      )}
      {...props}
    />
  );
}
