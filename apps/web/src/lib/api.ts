import { createHttpClient, PastaApi } from '@pasta/api-client';

import { env } from './env';

/**
 * Where this process reaches the API from.
 *
 * `NEXT_PUBLIC_API_URL` is the address a *browser* uses, and it is inlined at
 * build time. A Server Component runs inside the container, where that public
 * address is wrong — under Docker it resolves to the web container itself, so
 * every server-rendered list comes back empty while the browser works fine.
 *
 * `INTERNAL_API_URL` is read at request time and names the API on the internal
 * network (`http://api:4000/api/v1`). It is deliberately not a NEXT_PUBLIC
 * variable: it must never be inlined into the client bundle, and a browser
 * could not resolve it anyway. Unset — running everything on one host — the
 * public URL is correct for both.
 */
const serverBaseUrl = process.env.INTERNAL_API_URL || env.NEXT_PUBLIC_API_URL;

/**
 * Server-side API client.
 *
 * The public site reads through Server Components, so there is no browser token
 * to attach and no refresh cycle to run — this instance is deliberately
 * unauthenticated. Interactive, authenticated calls use the browser client
 * created in `providers.tsx`.
 */
export const api = new PastaApi(
  createHttpClient({
    baseURL: serverBaseUrl,
    withCredentials: false,
    timeoutMs: 10_000,
  }),
);

/**
 * Wraps a read so one failing panel cannot take down a whole page.
 * Returns `fallback` and logs, rather than throwing into the error boundary.
 */
export async function safely<T>(read: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await read;
  } catch (error) {
    console.error(`[api] ${label} failed:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}
