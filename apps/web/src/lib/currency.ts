import { CurrencyCode } from '@pasta/types';

/**
 * The currency the visitor is browsing in.
 *
 * Held in a plain (non-httpOnly) cookie so that Server Components can price a
 * page on the first render — no flash of € before JavaScript corrects it — and
 * the switcher in the header can still write it without a round trip.
 *
 * The two prices are separate figures entered by hand in the admin tour form,
 * so switching currency selects a column. Nothing is converted at a rate.
 */
export const CURRENCY_COOKIE = 'prt_currency';

/** A year: the choice should outlive the session. */
export const CURRENCY_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export const DEFAULT_CURRENCY: CurrencyCode = CurrencyCode.EUR;

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: CurrencyCode.EUR, label: 'Euro', symbol: '€' },
  { code: CurrencyCode.USD, label: 'US Dollar', symbol: '$' },
];

/** Anything unrecognised — a stale or hand-edited cookie — falls back to EUR. */
export function parseCurrency(value: string | undefined | null): CurrencyCode {
  return CURRENCIES.some((entry) => entry.code === value)
    ? (value as CurrencyCode)
    : DEFAULT_CURRENCY;
}
