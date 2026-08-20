import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';

import { activeCurrency } from '@/lib/currency.server';
import { env } from '@/lib/env';

import { Providers } from './providers';

import './globals.css';

/**
 * The stand-in for GT Walsheim.
 *
 * The brand face is licensed and self-hosted — see the `@font-face` block
 * in the shared theme for how to install it. Outfit is the closest
 * geometric sans on Google Fonts and holds the same shape until it is,
 * so a missing licence degrades the type rather than the layout.
 */
const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: 'Pasta Roma Tour — Discover Rome Like Never Before',
    template: '%s | Pasta Roma Tour',
  },
  description:
    'Book the best tours and tickets to iconic attractions, hidden gems, and unforgettable experiences across Italy.',
  keywords: ['Rome tours', 'Colosseum tickets', 'Vatican Museums', 'Italy day trips'],
  openGraph: {
    type: 'website',
    siteName: 'Pasta Roma Tour',
    locale: 'en_US',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
      { url: '/android-icon-192x192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [
      { url: '/apple-icon-57x57.png', sizes: '57x57' },
      { url: '/apple-icon-60x60.png', sizes: '60x60' },
      { url: '/apple-icon-72x72.png', sizes: '72x72' },
      { url: '/apple-icon-76x76.png', sizes: '76x76' },
      { url: '/apple-icon-114x114.png', sizes: '114x114' },
      { url: '/apple-icon-120x120.png', sizes: '120x120' },
      { url: '/apple-icon-144x144.png', sizes: '144x144' },
      { url: '/apple-icon-152x152.png', sizes: '152x152' },
      { url: '/apple-icon-180x180.png', sizes: '180x180' },
    ],
  },
  manifest: '/manifest.json',
  other: {
    // Windows tiles predate the manifest and still read their own meta pair.
    'msapplication-TileColor': '#ffffff',
    'msapplication-TileImage': '/ms-icon-144x144.png',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fffcfc' },
    { media: '(prefers-color-scheme: dark)', color: '#12100c' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once here rather than in each page, so the header switcher and the
  // server-rendered prices below it can never disagree on the first paint.
  const currency = await activeCurrency();

  return (
    <html lang="en" suppressHydrationWarning className={outfit.variable}>
      <body className="min-h-dvh antialiased">
        <Providers currency={currency}>{children}</Providers>
      </body>
    </html>
  );
}
