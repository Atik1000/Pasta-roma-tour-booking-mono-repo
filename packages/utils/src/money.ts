import type { CurrencyCode } from '@pasta/types';

const SYMBOLS: Record<CurrencyCode, string> = { EUR: '€', USD: '$' };

/** Converts a major-unit amount (59.5) to minor units (5950). */
export function toMinorUnits(major: number): number {
  return Math.round(major * 100);
}

/** Converts minor units (5950) back to a major-unit amount (59.5). */
export function toMajorUnits(minor: number): number {
  return minor / 100;
}

export function currencySymbol(currency: CurrencyCode): string {
  return SYMBOLS[currency];
}

/**
 * Formats minor units the way the designs do: `€118.00`, `$99.00`.
 * The symbol is always leading and unspaced, which is what every mock shows —
 * `Intl` would otherwise render `118,00 €` for EUR in most European locales.
 */
export function formatMoney(
  minor: number,
  currency: CurrencyCode = 'EUR',
  options: { showDecimals?: boolean } = {},
): string {
  const { showDecimals = true } = options;
  const value = toMajorUnits(minor);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(value);
  return `${currencySymbol(currency)}${formatted}`;
}

/** `From €59` — the compact price label on tour cards. */
export function formatPriceFrom(minor: number, currency: CurrencyCode = 'EUR'): string {
  return formatMoney(minor, currency, { showDecimals: false });
}

export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** Applies a conversion rate to a minor-unit amount, rounding to the nearest cent. */
export function convertMinor(minor: number, rate: number): number {
  return Math.round(minor * rate);
}
