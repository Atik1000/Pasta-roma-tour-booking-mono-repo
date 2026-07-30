'use client';

/**
 * "Recent Search History" on the hero.
 *
 * Per-browser by nature — there are no customer accounts — so it lives in local
 * storage rather than on the server. Reads are defensive: private-mode Safari
 * throws on access, and a hand-edited value must not break the home page.
 */
const STORAGE_KEY = 'prt_recent_searches';
const MAX_ENTRIES = 5;

export function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(terms: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(terms));
  } catch {
    // Storage full or blocked — the list is a convenience, not state to keep.
  }
}

/** Puts `term` at the front, de-duplicated case-insensitively. */
export function rememberSearch(term: string): string[] {
  const value = term.trim();
  if (!value) return readRecentSearches();

  const rest = readRecentSearches().filter((entry) => entry.toLowerCase() !== value.toLowerCase());
  const next = [value, ...rest].slice(0, MAX_ENTRIES);
  write(next);
  return next;
}

export function forgetSearch(term: string): string[] {
  const next = readRecentSearches().filter((entry) => entry !== term);
  write(next);
  return next;
}
