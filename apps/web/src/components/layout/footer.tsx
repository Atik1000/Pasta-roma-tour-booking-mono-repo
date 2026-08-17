import Link from 'next/link';

import { Clock, Facebook, Instagram, Mail, MapPin, Phone, Youtube } from 'lucide-react';

import { SkylineBackdrop, TripAdvisorMark, Wordmark } from './brand';

/**
 * Quick Links mirrors the navbar, so the footer offers the same map of the
 * site rather than a second, longer one that disagreed with it.
 */
const QUICK_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Locations', href: '/locations' },
  { label: 'Tours', href: '/tours' },
  { label: 'Blogs', href: '/blog' },
  { label: 'Cart', href: '/cart' },
  { label: 'My Bookings', href: '/my-bookings' },
];

/**
 * The two legal pages, moved down to the bottom bar when the Support column
 * was struck — they are still real pages and still have to be reachable, but
 * they are not something a visitor browses to.
 */
const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms & Conditions', href: '/terms' },
];

/**
 * Four marks, as drawn in every footer in the designs.
 *
 * These point at the platforms rather than at a profile: the brand's own
 * handles are not part of the designs, so they are the one thing here still
 * waiting on the client. Replace each `href` with the real profile URL.
 */
const SOCIALS = [
  { label: 'Facebook', href: 'https://facebook.com', icon: Facebook },
  { label: 'Instagram', href: 'https://instagram.com', icon: Instagram },
  { label: 'YouTube', href: 'https://youtube.com', icon: Youtube },
  { label: 'TripAdvisor', href: 'https://tripadvisor.com', icon: TripAdvisorMark },
];

export function Footer() {
  return (
    <footer className="border-border bg-cream-200/60 relative overflow-hidden border-t">
      <SkylineBackdrop className="text-cream-400/70" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        {/* Three columns since Support was struck; the brand column takes the
            extra width rather than leaving a gap where the fourth one was. */}
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr]">
          <div className="flex flex-col gap-4">
            <Wordmark />
            <p className="text-muted-foreground max-w-xs text-sm">
              Curated tours and unforgettable experiences across Italy.
              <br />
              Your journey, our passion.
            </p>
            <ul className="flex items-center gap-3">
              {SOCIALS.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    className="border-border bg-card text-foreground hover:border-primary hover:text-primary flex size-10 items-center justify-center rounded-full border transition-colors"
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-labelledby="footer-quick-links" className="flex flex-col gap-4">
            <h2 id="footer-quick-links" className="font-display text-lg font-semibold">
              Quick Links
            </h2>
            <ul className="flex flex-col gap-2.5">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-primary text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Contact Us</h2>
            <ul className="text-muted-foreground flex flex-col gap-3 text-sm">
              <li className="flex gap-2.5">
                <MapPin className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Via del Corso, 123
                  <br />
                  00186 Rome, Italy
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="text-primary size-4 shrink-0" aria-hidden />
                <a href="mailto:info@pastaromatour.com" className="hover:text-primary">
                  info@pastaromatour.com
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="text-primary size-4 shrink-0" aria-hidden />
                <a href="tel:+390612345678" className="hover:text-primary">
                  +39 06 1234 5678
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Clock className="text-primary size-4 shrink-0" aria-hidden />
                Mon – Sun: 9:00 AM – 7:00 PM (CET)
              </li>
            </ul>
          </div>
        </div>

        <div className="border-border mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} Pasta Roma Tour. All rights reserved.
          </p>
          <ul className="flex items-center gap-5">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-muted-foreground hover:text-primary text-sm transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
