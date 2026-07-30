'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type { CurrencyCode } from '@pasta/types';

import { browserApi } from '@/lib/browser-api';
import { syncCartCount } from '@/lib/cart-store';
import {
  CURRENCY_COOKIE,
  CURRENCY_COOKIE_MAX_AGE_SECONDS,
  DEFAULT_CURRENCY,
  parseCurrency,
} from '@/lib/currency';

/** The cookie as the browser sees it, for pages that were prerendered. */
function cookieCurrency(): CurrencyCode | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]*)`));
  return match ? parseCurrency(decodeURIComponent(match[1] ?? '')) : null;
}

interface CurrencyContextValue {
  currency: CurrencyCode;
  /** True while the basket is being re-priced. */
  isSwitching: boolean;
  select: (currency: CurrencyCode) => void;
}

const CurrencyContext = React.createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  isSwitching: false,
  select: () => undefined,
});

/**
 * Holds the currency the visitor is browsing in.
 *
 * The initial value is read from the cookie on the server, so the header and
 * every server-rendered price agree on the first paint. Switching writes the
 * cookie, re-prices the basket so it cannot end up half in € and half in $, and
 * then refreshes — which re-runs the Server Components and repaints every price
 * on the page from the API rather than converting anything in the browser.
 */
export function CurrencyProvider({
  initial,
  children,
}: {
  initial: CurrencyCode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [currency, setCurrency] = React.useState(initial);
  const [isSwitching, setIsSwitching] = React.useState(false);

  /**
   * Adopt whichever value the cookie holds.
   *
   * On a per-request page `initial` already came from that cookie and this is a
   * no-op. The blog and the content pages, though, are prerendered at build
   * time — their baked-in `initial` is always EUR — so without this the header
   * would claim € to a visitor who chose $ two clicks earlier. Prices are not
   * affected either way: those pages have none.
   */
  React.useEffect(() => setCurrency(cookieCurrency() ?? initial), [initial]);

  const select = React.useCallback(
    (next: CurrencyCode) => {
      if (next === currency) return;

      document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=${CURRENCY_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
      setCurrency(next);
      setIsSwitching(true);

      // The basket is re-priced before the refresh so the cart page and the
      // header badge never render a total in the currency just left behind.
      void browserApi.cart
        .setCurrency(next)
        .then(syncCartCount)
        .catch(() => {
          // An empty or expired basket has nothing to re-price; the page
          // refresh below still applies the new currency everywhere else.
        })
        .finally(() => {
          setIsSwitching(false);
          router.refresh();
        });
    },
    [currency, router],
  );

  const value = React.useMemo(
    () => ({ currency, isSwitching, select }),
    [currency, isSwitching, select],
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  return React.useContext(CurrencyContext);
}
