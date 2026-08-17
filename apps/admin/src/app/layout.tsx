import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';

import { Providers } from './providers';

import './globals.css';

/** Stand-in for the licensed GT Walsheim — see the shared theme's `@font-face`. */
const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit' });

export const metadata: Metadata = {
  title: { default: 'Dashboard | Pasta Roma Tour Admin', template: '%s | Pasta Roma Tour Admin' },
  description: 'Internal administration panel for Pasta Roma Tour.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={outfit.variable}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
