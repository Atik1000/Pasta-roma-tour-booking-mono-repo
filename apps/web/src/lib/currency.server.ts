import { cookies } from 'next/headers';

import type { CurrencyCode } from '@pasta/types';

import { CURRENCY_COOKIE, parseCurrency } from './currency';

/**
 * The currency this request should be priced in.
 *
 * Reading a cookie opts the route out of static generation, which is what a
 * priced page needs anyway: two visitors on the same URL can be shown different
 * currencies, so a shared prerendered copy would be wrong for one of them.
 */
export async function activeCurrency(): Promise<CurrencyCode> {
  const store = await cookies();
  return parseCurrency(store.get(CURRENCY_COOKIE)?.value);
}
