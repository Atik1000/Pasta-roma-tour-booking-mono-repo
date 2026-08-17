'use client';

import * as React from 'react';

import Link from 'next/link';

import { Button, cn } from '@pasta/ui';
import { ArrowRight, MapPin } from 'lucide-react';

import { SkylineBackdrop } from '@/components/layout/brand';

/**
 * Reveals its children once the band has actually been scrolled to.
 *
 * Animating on mount would have played the whole thing while the band was
 * still several screens below the fold, so by the time anyone arrived it had
 * long finished. The observer fires once and then disconnects — this is a
 * flourish, not something to replay every time the band passes by.
 *
 * No reduced-motion branch is needed: the global `prefers-reduced-motion` rule
 * collapses every transition to 0.01ms, so the content simply appears.
 */
function useRevealOnScroll<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Without IntersectionObserver — or if the band is already on screen at
    // load — show it rather than leaving it invisible forever.
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      // A little past the edge, so the movement starts as the band comes up
      // rather than after it has settled.
      { rootMargin: '0px 0px -15% 0px', threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, revealed };
}

/** Fade-and-rise, held back by `delay` so the three parts arrive in order. */
function Reveal({
  revealed,
  delay,
  className,
  children,
}: {
  revealed: boolean;
  delay: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        revealed ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The closing band.
 *
 * A visitor who has read the whole page is either convinced or gone, so this
 * asks once, plainly, and offers the two things they might want next: the whole
 * catalogue, or the destination list if they have not settled on a city.
 *
 * The gold drifts and the skyline floats behind it, and the copy rises into
 * place as the band is reached — enough movement to catch the eye at the point
 * where the page is asking for a decision, and slow enough not to nag.
 */
export function CtaBand() {
  const { ref, revealed } = useRevealOnScroll<HTMLElement>();

  return (
    <section ref={ref} className="relative isolate overflow-hidden">
      {/* `bg-[length:200%_200%]` gives the drift somewhere to travel — a
          gradient at its natural size has no room to move. */}
      <div
        aria-hidden
        className="animate-gradient-drift absolute inset-0 -z-10 bg-[linear-gradient(140deg,#7b4b14_0%,#b5751f_35%,#d29a45_60%,#b5751f_85%,#7b4b14_100%)] bg-[length:200%_200%]"
      />

      {/* A slow sheen crossing the band, kept faint so it reads as light on a
          surface rather than as a moving object. */}
      <div
        aria-hidden
        className="animate-shimmer absolute inset-0 -z-10 bg-[linear-gradient(105deg,transparent_35%,rgb(255_255_255/0.13)_50%,transparent_65%)] bg-[length:200%_100%] [animation-duration:7s]"
      />

      {/* Already absolutely positioned along the bottom edge by default. */}
      <SkylineBackdrop className="text-cream-100/15 animate-float -z-10" />

      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        <Reveal revealed={revealed} delay={0}>
          <h2 className="font-display text-balance text-3xl font-bold text-white sm:text-4xl">
            Your Rome is waiting
          </h2>
        </Reveal>

        <Reveal revealed={revealed} delay={120}>
          <p className="mx-auto mt-4 max-w-xl text-balance text-white/85">
            Pick a tour, choose a date, and we will handle the tickets, the timing and the queue.
          </p>
        </Reveal>

        {/* Full-width stacked buttons on a phone; side by side from `sm`. */}
        <Reveal
          revealed={revealed}
          delay={240}
          className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
        >
          <Button
            asChild
            size="lg"
            className="text-brand-700 hover:bg-cream-100 hover:text-brand-800 shadow-elevated bg-white transition-transform hover:-translate-y-0.5"
          >
            <Link href="/tours">
              Explore all tours
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/50 bg-white/10 text-white backdrop-blur-sm transition-transform hover:-translate-y-0.5 hover:bg-white/20 hover:text-white"
          >
            <Link href="/locations">
              <MapPin aria-hidden />
              Browse destinations
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
