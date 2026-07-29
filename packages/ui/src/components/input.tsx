'use client';

import * as React from 'react';

import { cn } from '../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon rendered inside the field, before the text. */
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** Marks the field invalid and wires `aria-invalid` for assistive tech. */
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leadingIcon, trailingIcon, invalid, type = 'text', ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        'rounded-field border-input bg-card text-foreground h-11 w-full border px-4 text-sm transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:border-primary focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'aria-invalid:border-danger aria-invalid:outline-danger',
        leadingIcon && 'pl-11',
        trailingIcon && 'pr-11',
        className,
      )}
      {...props}
    />
  );

  if (!leadingIcon && !trailingIcon) return field;

  return (
    <div className="relative">
      {leadingIcon ? (
        <span className="text-muted-foreground pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 [&_svg]:size-4">
          {leadingIcon}
        </span>
      ) : null}
      {field}
      {trailingIcon ? (
        <span className="text-muted-foreground absolute right-4 top-1/2 -translate-y-1/2 [&_svg]:size-4">
          {trailingIcon}
        </span>
      ) : null}
    </div>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        'rounded-field border-input bg-card text-foreground w-full resize-y border px-4 py-3 text-sm transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:border-primary focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'aria-invalid:border-danger aria-invalid:outline-danger',
        className,
      )}
      {...props}
    />
  );
});
