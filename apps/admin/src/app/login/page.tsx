import type { Metadata } from 'next';

import { LoginForm } from '@/components/auth/login-form';
import { ColosseumMark, SkylineBackdrop } from '@/components/layout/brand';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/** Sits outside the panel layout, so it renders without the sidebar. */
export default function AdminLoginPage() {
  return (
    <div className="bg-sidebar-gradient relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
      <SkylineBackdrop className="h-56 text-white/[0.07]" />

      <div className="relative w-full max-w-md">
        <div className="text-sidebar-foreground mb-8 flex flex-col items-center gap-2.5 text-center">
          <ColosseumMark className="text-primary size-10" />
          <span className="font-display text-2xl font-semibold">Pasta Roma Tour</span>
          <span className="text-sidebar-muted-foreground text-sm">Admin Panel</span>
        </div>

        <LoginForm />

        <p className="text-sidebar-muted-foreground mt-6 text-center text-xs">
          Authorised staff only. All sign-in attempts are logged.
        </p>
      </div>
    </div>
  );
}
