'use client';

import * as React from 'react';

import { Button } from '@pasta/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Phase 11 replaces this with the observability sink.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="text-muted-foreground mt-3">
        We hit an unexpected error. Try again — if it keeps happening, contact our support team.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground mt-2 font-mono text-xs">Reference: {error.digest}</p>
      ) : null}
      <Button className="mt-8" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
