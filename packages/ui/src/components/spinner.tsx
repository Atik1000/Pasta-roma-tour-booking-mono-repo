import * as React from 'react';

import { Loader2 } from 'lucide-react';

import { cn } from '../lib/cn';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZES = { sm: 'size-4', md: 'size-6', lg: 'size-9' } as const;

export function Spinner({ className, size = 'md', label = 'Loading', ...props }: SpinnerProps) {
  return (
    <div role="status" aria-live="polite" className={cn('inline-flex', className)} {...props}>
      <Loader2 className={cn('text-primary animate-spin', SIZES[size])} aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
