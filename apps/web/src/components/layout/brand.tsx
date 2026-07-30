import type { SVGProps } from 'react';

import { cn } from '@pasta/ui';

/**
 * The Colosseum wordmark glyph. Inline SVG rather than an image file so it
 * inherits `currentColor` and stays crisp at every size.
 */
export function ColosseumMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 30"
      aria-hidden
      focusable="false"
      className={cn('text-primary size-8', className)}
    >
      <g fill="currentColor">
        <path d="M2 9h28v2H2zM2 13h28v1.5H2zM2 17h28v1.5H2zM2 21h28v1.5H2z" opacity=".55" />
        <path d="M4 6h24a2 2 0 0 1 2 2v1H2V8a2 2 0 0 1 2-2Z" />
        <path d="M3 9h2v18H3zM8 9h2v18H8zM13 9h2v18h-2zM18 9h2v18h-2zM23 9h2v18h-2zM28 9h2v18h-2z" />
        <path d="M1 27h30v2H1z" />
        <path d="M14 2h4v4h-4z" opacity=".45" />
      </g>
    </svg>
  );
}

export function Wordmark({
  className,
  markClassName,
  subtitle,
}: {
  className?: string;
  markClassName?: string;
  subtitle?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <ColosseumMark className={markClassName} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          Pasta Roma Tour
        </span>
        {subtitle ? (
          <span className="text-sidebar-muted-foreground mt-1 text-xs">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * TripAdvisor's owl, drawn as the two-eye mark.
 *
 * Inline like the rest of the marks here: `lucide-react` carries no
 * TripAdvisor glyph, and the footer deliberately loads no third-party assets.
 * Swap in the official SVG from their brand kit when the client supplies one.
 */
export function TripAdvisorMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={cn('size-4', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      {/* Brow, then the two eyes with their pupils. */}
      <path d="M7.5 6.5h9M3.4 9.2 6 7.3M20.6 9.2 18 7.3" />
      <circle cx="7" cy="13.5" r="4.2" />
      <circle cx="17" cy="13.5" r="4.2" />
      <circle cx="7" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * The faint Roman skyline that sits behind the hero and the footer in the
 * designs. Purely decorative.
 */
export function SkylineBackdrop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 220"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
      focusable="false"
      className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full', className)}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".35">
        {/* Basilica dome */}
        <path d="M120 200v-70a45 45 0 0 1 90 0v70" />
        <path d="M165 60v-14M140 130h50" />
        {/* Colonnade */}
        <path d="M230 200v-58h140v58M250 142v58M280 142v58M310 142v58M340 142v58" />
        {/* Colosseum */}
        <path d="M420 200v-64a80 46 0 0 1 160 0v64" />
        <path d="M430 158h140M430 178h140M455 136v64M490 132v68M525 132v68M560 136v64" />
        {/* Aqueduct */}
        <path d="M640 200v-52h220v52M672 148v52M712 148v52M752 148v52M792 148v52M832 148v52" />
        <path d="M652 148a20 18 0 0 1 40 0M692 148a20 18 0 0 1 40 0M732 148a20 18 0 0 1 40 0M772 148a20 18 0 0 1 40 0M812 148a20 18 0 0 1 40 0" />
        {/* Pantheon */}
        <path d="M910 200v-46h150v46M930 154l55-34 55 34" />
        <path d="M950 154v46M985 154v46M1020 154v46" />
        {/* Tower */}
        <path d="M1100 200v-96h44v96M1100 128h44M1122 104V86" />
      </g>
    </svg>
  );
}
