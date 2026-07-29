'use client';

import * as React from 'react';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const Overlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function Overlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'bg-cream-900/40 data-[state=open]:animate-fade-in fixed inset-0 z-50 backdrop-blur-[2px]',
        className,
      )}
      {...props}
    />
  );
});

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Hides the default close button when the dialog supplies its own. */
    hideClose?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
  }
>(function DialogContent({ className, children, hideClose, size = 'md', ...props }, ref) {
  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  } as const;

  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'rounded-card border-border bg-card shadow-elevated max-h-[calc(100dvh-2rem)] overflow-y-auto border p-6',
          'data-[state=open]:animate-fade-up',
          widths[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            className={cn(
              'rounded-field text-muted-foreground absolute right-4 top-4 p-1.5 transition-colors',
              'hover:bg-muted hover:text-foreground',
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col gap-1.5 pr-8', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('font-display text-xl font-semibold', className)}
      {...props}
    />
  );
});

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
});

/**
 * Slide-over panel: mobile navigation on the public site, and filter panels in
 * the admin tables. Built on the same primitive as `Dialog` so focus trapping
 * and scroll locking behave identically.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: 'left' | 'right' | 'bottom';
  }
>(function SheetContent({ className, children, side = 'right', ...props }, ref) {
  const sides = {
    left: 'inset-y-0 left-0 h-full w-80 max-w-[85vw] border-r',
    right: 'inset-y-0 right-0 h-full w-80 max-w-[85vw] border-l',
    bottom: 'inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-card border-t',
  } as const;

  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'border-border bg-card shadow-elevated fixed z-50 overflow-y-auto p-6',
          'data-[state=open]:animate-fade-in',
          sides[side],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            'rounded-field text-muted-foreground absolute right-4 top-4 p-1.5 transition-colors',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
