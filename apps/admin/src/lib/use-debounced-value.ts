'use client';

import * as React from 'react';

/**
 * The value, settled.
 *
 * Search boxes drive server queries, so feeding them straight into a query key
 * sends a request per keystroke — nine for "Colosseum", eight of them already
 * stale by the time they land. This holds the value back until typing pauses.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
