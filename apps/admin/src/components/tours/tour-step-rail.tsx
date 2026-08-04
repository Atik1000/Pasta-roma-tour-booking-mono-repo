'use client';

import { cn } from '@pasta/ui';
import { Check } from 'lucide-react';

export interface StepRailItem {
  id: string;
  label: string;
  /** Required steps block the walk forward until they are filled in. */
  required?: boolean;
  complete: boolean;
}

/**
 * The progress rail above the wizard.
 *
 * Steps already visited are clickable, so going back to fix something is one
 * press rather than a walk backwards. Steps ahead are not: the point of a
 * wizard is that it decides what comes next, and letting someone jump to step
 * five of a form they have not started is how the single-screen version got
 * confusing in the first place. In edit mode every step is reachable, because
 * there is nothing left to sequence.
 */
export function TourStepRail({
  steps,
  current,
  furthest,
  unlockAll,
  onSelect,
}: {
  steps: StepRailItem[];
  current: number;
  /** The furthest step reached so far; everything up to it stays reachable. */
  furthest: number;
  unlockAll: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((step, index) => {
        const isCurrent = index === current;
        const reachable = unlockAll || index <= furthest;
        const done = step.complete && !isCurrent;

        return (
          <li key={step.id} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!reachable}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onSelect(index)}
              className={cn(
                'rounded-field flex items-center gap-2 px-2.5 py-1.5 text-sm transition-colors',
                'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                isCurrent && 'bg-accent/50 text-foreground font-medium',
                !isCurrent && reachable && 'text-muted-foreground hover:bg-muted',
                !reachable && 'text-muted-foreground/60 cursor-not-allowed',
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done && 'bg-success-soft text-success',
                  isCurrent && !done && 'bg-brand-gradient text-primary-foreground',
                  !done && !isCurrent && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              <span className="whitespace-nowrap">
                {step.label}
                {step.required ? <span className="text-danger ml-1">*</span> : null}
              </span>
            </button>

            {index < steps.length - 1 ? (
              <span className="bg-border h-px w-4 shrink-0" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
