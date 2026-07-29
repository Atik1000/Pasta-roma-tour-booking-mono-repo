import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * The laurel-wreath flourish that brackets section titles and page headings
 * throughout the designs. Decorative, so it is hidden from assistive tech.
 */
function Laurel({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 40"
      aria-hidden
      focusable="false"
      className={cn('text-primary/70 h-8 w-5', className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M18 3C10 9 7 17 8 24c.7 5 3.6 10 8 13" />
        <path d="M15 8c-3-1-6 0-7 2M13 14c-3-1.2-6.2-.6-7.6 1.4M12 20c-3-1.4-6.3-1-7.8 1M12.5 26c-2.8-1.8-6-1.8-7.8 0M14 31c-2.4-2.2-5.6-2.8-7.8-1.4" />
      </g>
    </svg>
  );
}

export interface SectionHeadingProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** `center` for marketing sections, `start` for page headers. */
  align?: 'center' | 'start';
  /** Small gold text above the title, e.g. "Authentic Experiences." */
  eyebrow?: React.ReactNode;
  laurels?: boolean;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}

export function SectionHeading({
  title,
  description,
  align = 'center',
  eyebrow,
  laurels = true,
  as: Heading = 'h2',
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow ? <p className="text-primary text-sm font-medium tracking-wide">{eyebrow}</p> : null}

      <div className="flex items-center gap-3">
        {laurels ? <Laurel /> : null}
        <Heading
          className={cn(
            'font-display text-balance font-semibold',
            Heading === 'h1' ? 'text-4xl sm:text-5xl' : 'text-3xl',
          )}
        >
          {title}
        </Heading>
        {laurels ? <Laurel className="-scale-x-100" /> : null}
      </div>

      {description ? (
        <p className="text-muted-foreground max-w-2xl text-balance">{description}</p>
      ) : null}
    </div>
  );
}

export interface TimelineStep {
  title: string;
  description: string;
}

/** The numbered "Tour Plan" itinerary on the tour detail page. */
export function Timeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <ol className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {steps.map((step, index) => (
        <li key={index} className="relative flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="bg-brand-gradient text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
              {index + 1}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className="border-primary/40 hidden h-px flex-1 border-t border-dashed sm:block"
              />
            ) : null}
          </div>

          <div className="rounded-card border-border bg-card border p-4">
            <h4 className="text-sm font-semibold">{step.title}</h4>
            <p className="text-muted-foreground mt-1 text-sm">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
