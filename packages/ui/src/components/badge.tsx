import * as React from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        brand: 'bg-accent text-accent-foreground',
        success: 'bg-success-soft text-success-foreground',
        warning: 'bg-warning-soft text-warning-foreground',
        danger: 'bg-danger-soft text-danger-foreground',
        info: 'bg-info-soft text-info-foreground',
        /** Solid gold pill — the "Bestseller" ribbon on tour cards. */
        solid: 'bg-brand-gradient text-primary-foreground shadow-sm',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
