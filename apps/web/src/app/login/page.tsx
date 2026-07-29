import type { Metadata } from 'next';
import Link from 'next/link';

import { Button, Card, CardContent } from '@pasta/ui';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';

import { Footer } from '@/components/layout/footer';
import { Wordmark } from '@/components/layout/brand';
import { Navbar } from '@/components/layout/navbar';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Find your bookings, or sign in to the Pasta Roma Tour admin panel.',
  robots: { index: false, follow: true },
};

/**
 * There are no customer accounts — checkout is guest-only and bookings are
 * found by email. This page therefore routes the two real cases: travellers go
 * to the booking lookup, staff go to the admin panel.
 */
export default function LoginPage() {
  return (
    <>
      <Navbar />

      <main id="main" className="mx-auto max-w-lg px-4 py-20 sm:px-6">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-6 p-8">
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                You don&apos;t need an account to book with us.
              </p>
            </div>

            <Link
              href="/my-bookings"
              className="rounded-card border-border hover:border-primary group flex items-start gap-4 border p-5 transition-colors"
            >
              <span className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
                <Mail className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  Find my bookings
                  <ArrowRight
                    className="text-primary size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  Enter the email address you booked with and we&apos;ll send a secure link to your
                  booking history.
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Staff</span>
              <span className="bg-border h-px flex-1" />
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground flex items-start gap-2.5 text-sm">
                <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                The admin panel is for Pasta Roma Tour staff. Sign in there to manage tours,
                bookings and content.
              </p>
              <Button asChild block variant="outline">
                <a href={`${env.NEXT_PUBLIC_ADMIN_URL}/login`}>Go to the admin panel</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </>
  );
}
