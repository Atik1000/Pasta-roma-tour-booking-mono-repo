'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Spinner } from '@pasta/ui';

import { restoreSession, useSession } from '@/lib/session';

/**
 * Gate for the whole panel. On first load there is no in-memory token, so it
 * tries the refresh cookie; if that fails the visitor goes to the login screen.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, isReady } = useSession();

  React.useEffect(() => {
    if (!isReady) void restoreSession();
  }, [isReady]);

  React.useEffect(() => {
    if (isReady && !accessToken) router.replace('/login');
  }, [isReady, accessToken, router]);

  if (!isReady || !accessToken) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size="lg" label="Checking your session" />
      </div>
    );
  }

  return <>{children}</>;
}
