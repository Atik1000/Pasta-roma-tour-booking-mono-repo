import Link from 'next/link';

import { Button } from '@pasta/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-primary text-6xl">404</p>
      <h1 className="font-display mt-4 text-3xl">This page took a wrong turn in Rome</h1>
      <p className="text-muted-foreground mt-3">
        The page you are looking for has moved or never existed.
      </p>
      <Button asChild className="mt-8">
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  );
}
