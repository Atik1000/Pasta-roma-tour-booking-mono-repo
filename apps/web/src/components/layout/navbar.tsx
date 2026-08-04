'use client';

import * as React from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from '@pasta/ui';
import { ChevronDown, Menu, ShoppingCart, User } from 'lucide-react';

import { useCurrency } from '@/components/currency-provider';
import { browserApi } from '@/lib/browser-api';
import { useCartCount } from '@/lib/cart-store';
import { CURRENCIES } from '@/lib/currency';

import { Wordmark } from './brand';

const NAV_LINKS = [
  { label: 'Search Tours', href: '/tours' },
  { label: 'Products', href: '/products' },
  { label: 'Blogs', href: '/blog' },
] as const;

export interface NavbarProps {
  /** Floats over the hero image on pages that have one. */
  overlay?: boolean;
}

export function Navbar({ overlay = false }: NavbarProps) {
  const pathname = usePathname();
  // Read from the shared store rather than a prop: the header appears on every
  // page, and threading a count through each one is how it ended up always
  // showing zero.
  const cartCount = useCartCount();
  // Selecting a currency re-prices the basket and refreshes the page, so every
  // figure on screen comes back from the API in the chosen currency.
  const { currency, isSwitching, select } = useCurrency();
  const [locations, setLocations] = React.useState<string[]>([]);

  // The Locations menu reflects the catalogue, so it is read from the API.
  React.useEffect(() => {
    let cancelled = false;
    void browserApi.locations
      .list()
      .then((rows) => {
        if (!cancelled)
          setLocations(rows.filter((row) => row.tourCount > 0).map((row) => row.name));
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  /**
   * Overlaying a photograph, not a gradient.
   *
   * The overlay bar used to be 85% cream, which was invisible over the old gold
   * hero but cuts a pale band across the top of a photograph — the sky just
   * stops. It is transparent now, with a dark scrim carrying the type instead,
   * so the image runs edge to edge behind it.
   *
   * That flips the text: dark links vanish against a sunset, so everything in
   * the bar switches to white while overlaying. Non-overlay pages are untouched.
   */
  const linkTone = overlay
    ? 'text-white/90 hover:text-white'
    : 'text-foreground hover:text-primary';
  const activeTone = overlay ? 'text-white font-medium' : 'text-primary';

  return (
    <header
      className={cn(
        'z-40 w-full',
        overlay
          ? 'absolute inset-x-0 top-0 text-white'
          : 'border-border bg-card/95 shadow-navbar sticky top-0 border-b backdrop-blur-md',
      )}
    >
      {overlay ? (
        <div
          aria-hidden
          className="from-cream-900/75 pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent"
        />
      ) : null}

      <nav
        aria-label="Primary"
        className="relative mx-auto flex h-20 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8"
      >
        <Link
          href="/"
          className="rounded-field focus-visible:outline-ring shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Wordmark />
          <span className="sr-only">Pasta Roma Tour — home</span>
        </Link>

        <ul className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.slice(0, 1).map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'text-sm transition-colors',
                  isActive(link.href) ? activeTone : linkTone,
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}

          <li>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  'focus-visible:outline-ring flex items-center gap-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4',
                  linkTone,
                )}
              >
                Locations
                <ChevronDown className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {locations.map((location: string) => (
                  <DropdownMenuItem key={location} asChild>
                    <Link href={`/tours?location=${encodeURIComponent(location)}`}>{location}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>

          {NAV_LINKS.slice(1).map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'text-sm transition-colors',
                  isActive(link.href) ? activeTone : linkTone,
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}

          <li>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isSwitching}
                aria-label={`Currency: ${currency}. Change currency.`}
                className={cn(
                  'focus-visible:outline-ring flex items-center gap-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60',
                  linkTone,
                )}
              >
                {currency}
                <ChevronDown className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {CURRENCIES.map((entry) => (
                  <DropdownMenuItem
                    key={entry.code}
                    aria-current={entry.code === currency ? 'true' : undefined}
                    onSelect={() => select(entry.code)}
                  >
                    <span className="w-4">{entry.symbol}</span>
                    {entry.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>

        <div className="flex items-center gap-3">
          <Link
            href="/cart"
            className={cn(
              'relative hidden items-center gap-2 text-sm transition-colors sm:inline-flex',
              linkTone,
            )}
          >
            <ShoppingCart className="size-5" aria-hidden />
            Cart
            {cartCount > 0 ? (
              <span
                aria-label={`${cartCount} ${cartCount === 1 ? 'ticket' : 'tickets'} in your cart`}
                className="bg-danger absolute -top-2 left-3 flex size-5 items-center justify-center rounded-full text-[0.625rem] font-semibold text-white"
              >
                {cartCount}
              </span>
            ) : null}
          </Link>

          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/login">
              <User className="size-4" aria-hidden />
              Login
            </Link>
          </Button>

          {/* Mobile */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="subtle"
                size="icon"
                aria-label="Open menu"
                className={cn(
                  'lg:hidden',
                  // The subtle variant is a pale grey chip — invisible on a
                  // photograph, which is all a phone sees of this page.
                  overlay && 'border-white/40 bg-white/15 text-white hover:bg-white/25',
                )}
              >
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col gap-6">
              <Wordmark />
              <ul className="flex flex-col gap-1">
                {[{ label: 'Search Tours', href: '/tours' }, ...NAV_LINKS.slice(1)].map((link) => (
                  <li key={link.href}>
                    <SheetClose asChild>
                      <Link
                        href={link.href}
                        className="rounded-field hover:bg-muted block px-3 py-2.5 text-sm"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  </li>
                ))}
                <li>
                  <SheetClose asChild>
                    <Link
                      href="/cart"
                      className="rounded-field hover:bg-muted block px-3 py-2.5 text-sm"
                    >
                      Cart
                    </Link>
                  </SheetClose>
                </li>
                <li>
                  <SheetClose asChild>
                    <Link
                      href="/my-bookings"
                      className="rounded-field hover:bg-muted block px-3 py-2.5 text-sm"
                    >
                      My Bookings
                    </Link>
                  </SheetClose>
                </li>
              </ul>
              <Button asChild block>
                <Link href="/login">Login</Link>
              </Button>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
