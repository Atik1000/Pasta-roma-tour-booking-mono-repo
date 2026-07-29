import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge` needs to know about the custom scales declared in
 * `@pasta/config/tailwind/theme.css`, otherwise `shadow-card` and
 * `rounded-card` are treated as unknown classes and never de-duplicated.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-family': [{ font: ['sans', 'display'] }],
      shadow: [{ shadow: ['card', 'elevated', 'navbar'] }],
      rounded: [{ rounded: ['card', 'field'] }],
      animate: [{ animate: ['fade-in', 'fade-up', 'accordion-down', 'accordion-up', 'shimmer'] }],
    },
  },
});

/** Conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
