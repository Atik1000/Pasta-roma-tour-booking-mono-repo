'use client';

import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '../lib/cn';

const buttonVariants = cva(
  'focus-visible:outline-ring inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Primary CTA — the gold gradient used for Book Now, Check Availability, Save Changes. */
        primary:
          'bg-brand-gradient text-primary-foreground shadow-sm hover:brightness-105 active:brightness-95',
        /** Secondary CTA — gold outline, used for View Details and Continue Shopping. */
        outline:
          'border-primary text-primary hover:bg-accent hover:text-accent-foreground border bg-transparent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted bg-transparent',
        link: 'text-primary bg-transparent underline-offset-4 hover:underline',
        destructive: 'bg-danger text-white shadow-sm hover:brightness-110',
        /** Row actions in the admin tables (view / edit / delete icon buttons). */
        subtle:
          'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground border',
      },
      size: {
        sm: 'rounded-field h-9 px-3 text-sm',
        md: 'rounded-field h-11 px-5 text-sm',
        lg: 'h-13 rounded-field px-7 text-base',
        icon: 'rounded-field size-9',
        pill: 'h-11 rounded-full px-6 text-sm',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render as the child element (e.g. a Next.js `<Link>`) instead of a `<button>`. */
  asChild?: boolean;
  isLoading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    isLoading = false,
    leadingIcon,
    trailingIcon,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size, block }), className);

  // `Slot` forwards props onto a single child, so decorations are only rendered
  // when this component owns the element.
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled ?? isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin" aria-hidden /> : leadingIcon}
      {children}
      {!isLoading && trailingIcon}
    </button>
  );
});

export { buttonVariants };
