import { getCountryDataList, getEmojiFlag, type TCountryCode } from 'countries-list';

export type CountryOption = {
  /** ISO 3166-1 alpha-2, e.g. `IT`. Used as the select's value. */
  code: TCountryCode;
  /** English name, e.g. `Italy`. This is what the API stores on a location. */
  name: string;
  /** Flag emoji, for the dropdown only — never part of the stored value. */
  flag: string;
};

/** Every ISO 3166-1 country, A–Z by English name. */
export const COUNTRIES: CountryOption[] = getCountryDataList()
  .map((country) => ({
    code: country.iso2,
    name: country.name,
    flag: getEmojiFlag(country.iso2),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_NAME = new Map(COUNTRIES.map((country) => [country.name.toLowerCase(), country]));

/**
 * The stored country is a name, not a code, so an existing location has to be
 * matched back to the list before its code can seed the select.
 */
export function countryCodeForName(name: string): TCountryCode | undefined {
  return BY_NAME.get(name.trim().toLowerCase())?.code;
}

/**
 * Flag for a stored country name, or `''` when it predates the picker and does
 * not match the list. Callers render it decoratively, so an empty string is a
 * clean fallback rather than something to guard against.
 */
export function countryFlag(name: string): string {
  return BY_NAME.get(name.trim().toLowerCase())?.flag ?? '';
}
