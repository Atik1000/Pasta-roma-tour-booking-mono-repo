import { createHttpClient, PastaApi } from '@pasta/api-client';

import { env } from './env';

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
    baseURL: env.NEXT_PUBLIC_API_URL,
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
