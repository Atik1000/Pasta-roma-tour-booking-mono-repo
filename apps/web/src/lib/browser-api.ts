'use client';

import { createHttpClient, PastaApi } from '@pasta/api-client';

import { env } from './env';

/**
 * Browser-side API client for interactive reads and writes. Credentials are
 * sent so the cart cookie travels with the request.
 */
export const browserApi = new PastaApi(
  createHttpClient({
    baseURL: env.NEXT_PUBLIC_API_URL,
    withCredentials: true,
  }),
);
