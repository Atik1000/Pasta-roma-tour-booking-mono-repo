import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';

import { activeCurrency } from '@/lib/currency.server';
import { env } from '@/lib/env';

import { Providers } from './providers';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
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
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf7f1' },
    { media: '(prefers-color-scheme: dark)', color: '#12100c' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once here rather than in each page, so the header switcher and the
  // server-rendered prices below it can never disagree on the first paint.
  const currency = await activeCurrency();

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers currency={currency}>{children}</Providers>
      </body>
    </html>
  );
}
