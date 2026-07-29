'use client';

import * as React from 'react';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check } from 'lucide-react';

import { cn } from '../lib/cn';

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'border-input bg-card peer size-5 shrink-0 rounded-[0.375rem] border transition-colors',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-[state=checked]:bg-success data-[state=unchecked]:bg-muted',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform',
          'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
});

export const RadioGroup = RadioGroupPrimitive.Root;

/**
 * A selectable card — used for the time slots on Check Availability and for
 * payment-method choices at checkout.
 */
export const RadioCard = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & {
    label: React.ReactNode;
    description?: React.ReactNode;
  }
>(function RadioCard({ className, label, description, disabled, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      disabled={disabled}
      className={cn(
        'rounded-card border-border bg-card group flex w-full items-center justify-between gap-3 border px-4 py-3 text-left transition-all',
        'hover:border-primary/60',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-[state=checked]:border-primary data-[state=checked]:bg-accent/40',
        'disabled:hover:border-border disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <span className="min-w-0">
        <span className="text-foreground block text-sm font-medium">{label}</span>
        {description ? (
          <span className="text-muted-foreground mt-0.5 block text-xs">{description}</span>
        ) : null}
      </span>

      <span
        aria-hidden
        className={cn(
          'border-input flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          'group-data-[state=checked]:border-primary',
        )}
      >
        <RadioGroupPrimitive.Indicator className="bg-primary size-2.5 rounded-full" />
      </span>
    </RadioGroupPrimitive.Item>
  );
});
