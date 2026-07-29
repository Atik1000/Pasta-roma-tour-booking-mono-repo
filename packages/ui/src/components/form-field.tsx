'use client';

import * as React from 'react';

import * as LabelPrimitive from '@radix-ui/react-label';

import { cn } from '../lib/cn';

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(function Label({ className, required, children, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-foreground text-sm font-medium', className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-danger ml-0.5" aria-hidden>
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
});

export interface FormFieldProps {
  label?: React.ReactNode;
  /** Helper text shown under the control when there is no error. */
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + control + hint/error, wired for accessibility.
 *
 * The control is cloned with `id`, `aria-describedby` and `aria-invalid`, so
 * callers only pass the field itself and screen readers still announce the
 * label and the validation message.
 */
export function FormField({ label, hint, error, required, className, children }: FormFieldProps) {
  const generatedId = React.useId();
  const controlId = `${generatedId}-control`;
  const messageId = `${generatedId}-message`;
  const message = error ?? hint;

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: controlId,
        'aria-describedby': message ? messageId : undefined,
        'aria-invalid': error ? true : undefined,
        invalid: error ? true : undefined,
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <Label htmlFor={controlId} required={required}>
          {label}
        </Label>
      ) : null}

      {control}

      {message ? (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-xs', error ? 'text-danger' : 'text-muted-foreground')}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
