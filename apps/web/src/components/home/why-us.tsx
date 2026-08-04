import { SectionHeading } from '@pasta/ui';
import { BadgeCheck, CalendarCheck2, Headphones, Ticket } from 'lucide-react';

/**
 * The four promises, in the order a traveller worries about them: can I trust
 * the guide, what if my plans change, will the ticket actually arrive, and who
 * do I call when something goes wrong. Each one is a claim the business already
 * makes elsewhere on the site — the cart repeats three of them at the point of
 * payment — so nothing here is a promise the product does not keep.
 */
const REASONS = [
  {
    icon: BadgeCheck,
    title: 'Licensed local guides',
    body: 'Every tour is led by an accredited guide who lives here — not a script read from an app.',
  },
  {
    icon: CalendarCheck2,
    title: 'Free cancellation',
    body: 'Plans change. Cancel up to 24 hours before your tour starts and pay nothing at all.',
  },
  {
    icon: Ticket,
    title: 'Instant e-tickets',
    body: 'Your confirmation and tickets arrive by email the moment you book. No queue, no printing.',
  },
  {
    icon: Headphones,
    title: 'Support that answers',
    body: 'Reach a real person any day of the week, before you book and while you are travelling.',
  },
];

export function WhyUs() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
      <SectionHeading
        eyebrow="Why book with us"
        title="Booked With Confidence"
        description="Twelve thousand travellers a year, and the same promises to every one of them."
      />

      {/* Two across on tablets — four in a row at iPad width left each column
          too narrow for a sentence to breathe. */}
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {REASONS.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="rounded-card border-border bg-card shadow-card flex flex-col gap-3 border p-6"
          >
            <span className="bg-brand-100 text-primary flex size-12 items-center justify-center rounded-full">
              <Icon className="size-6" aria-hidden />
            </span>
            <h3 className="font-display text-lg font-semibold">{title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
