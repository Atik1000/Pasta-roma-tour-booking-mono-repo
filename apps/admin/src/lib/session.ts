'use client';

import { createHttpClient, PastaApi, type AuthUser } from '@pasta/api-client';
import { create } from 'zustand';

import { env } from './env';

interface SessionState {
  accessToken: string | null;
  user: AuthUser | null;
  /** False until the initial refresh attempt has settled. */
  isReady: boolean;
  setSession: (token: string, user: AuthUser) => void;
  clear: () => void;
  markReady: () => void;
}

/**
 * The access token lives in memory only.
 *
 * Storing it in localStorage would expose it to any XSS on the page; the
 * long-lived credential is the httpOnly refresh cookie the API sets, which
 * JavaScript cannot read. A page reload therefore starts with no token and
 * silently re-obtains one via `/auth/refresh`.
 */
export const useSession = create<SessionState>((set) => ({
  accessToken: null,
  user: null,
  isReady: false,
  setSession: (accessToken, user) => set({ accessToken, user, isReady: true }),
  clear: () => set({ accessToken: null, user: null, isReady: true }),
  markReady: () => set({ isReady: true }),
}));

/**
 * Authenticated API client.
 *
 * Reads the token from the store on every request and, on a 401, exchanges the
 * refresh cookie for a new one exactly once — concurrent 401s share a single
 * refresh, which `HttpClient` coalesces internally.
 */
export const adminApi = new PastaApi(
  createHttpClient({
    baseURL: env.NEXT_PUBLIC_API_URL,
    withCredentials: true,
    getAccessToken: () => useSession.getState().accessToken,
    refreshAccessToken: async () => {
      try {
        const result = await bareClient.auth.refresh();
        useSession.getState().setSession(result.accessToken, result.user);
        return result.accessToken;
      } catch {
        useSession.getState().clear();
        return null;
      }
    },
    onSessionExpired: () => useSession.getState().clear(),
  }),
);

/**
 * A second client without the refresh hook, used *by* the refresh hook —
 * otherwise a failing refresh would recurse into itself.
 */
const bareClient = new PastaApi(
  createHttpClient({
    baseURL: env.NEXT_PUBLIC_API_URL,
    withCredentials: true,
  }),
);

/** Attempts to restore a session from the refresh cookie on first load. */
export async function restoreSession(): Promise<void> {
  const state = useSession.getState();

  try {
    const result = await bareClient.auth.refresh();
    state.setSession(result.accessToken, result.user);
  } catch {
    state.clear();
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const result = await bareClient.auth.login(email, password);
  useSession.getState().setSession(result.accessToken, result.user);
}

export async function signOut(): Promise<void> {
  await bareClient.auth.logout().catch(() => undefined);
  useSession.getState().clear();
}
