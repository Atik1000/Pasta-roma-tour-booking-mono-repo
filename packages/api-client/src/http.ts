import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { ApiError, ApiSuccess, Paginated } from '@pasta/types';

import { ApiClientError } from './errors';

export interface HttpClientOptions {
  baseURL: string;
  /** Returns the current access token, if any. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Called once when a request fails with 401. Should exchange the refresh
   * cookie for a new access token and return it, or return `null` to give up.
   */
  refreshAccessToken?: () => Promise<string | null>;
  /** Called when refreshing fails — the app should clear session state here. */
  onSessionExpired?: () => void;
  timeoutMs?: number;
  /** Send the httpOnly refresh cookie with every request. */
  withCredentials?: boolean;
  defaultHeaders?: Record<string, string>;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function toApiClientError(error: AxiosError<ApiError>): ApiClientError {
  if (error.response) {
    const { status, data } = error.response;
    return new ApiClientError({
      message: data?.message ?? error.message ?? 'Request failed',
      statusCode: data?.statusCode ?? status,
      errors: data?.errors,
      path: data?.path,
    });
  }

  return new ApiClientError({
    message: 'Unable to reach the server. Check your connection and try again.',
    statusCode: 0,
    isNetworkError: true,
  });
}

/**
 * Axios wrapper that unwraps the API's `{ success, data, meta }` envelope and
 * transparently refreshes an expired access token — coalescing concurrent 401s
 * into a single refresh call.
 */
export class HttpClient {
  private readonly instance: AxiosInstance;
  private readonly options: HttpClientOptions;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(options: HttpClientOptions) {
    this.options = options;
    this.instance = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeoutMs ?? 20_000,
      withCredentials: options.withCredentials ?? true,
      headers: { 'Content-Type': 'application/json', ...options.defaultHeaders },
    });

    this.instance.interceptors.request.use(async (config) => {
      const token = await this.options.getAccessToken?.();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }

      /**
       * A multipart body must not inherit the instance's JSON content type.
       *
       * Axios only leaves a FormData body alone when the content type is not
       * JSON: with `application/json` still set it runs the body through
       * `formDataToJSON` instead, and a File serialises to `{}`. The request
       * then arrives as `{"file":{}}` with a JSON content type, the server's
       * multipart parser never runs, and the upload fails with "No file was
       * received" — while the browser network tab shows a perfectly ordinary
       * 400. Clearing it here lets the browser set `multipart/form-data` with
       * the boundary it generates, which is the only thing that can produce a
       * valid boundary anyway.
       */
      if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        config.headers.delete('Content-Type');
      }

      return config;
    });

    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const config = error.config as RetriableConfig | undefined;
        const canRetry =
          error.response?.status === 401 &&
          config !== undefined &&
          !config._retried &&
          this.options.refreshAccessToken !== undefined;

        if (!canRetry) {
          throw toApiClientError(error);
        }

        config._retried = true;
        const token = await this.refreshOnce();

        if (!token) {
          this.options.onSessionExpired?.();
          throw toApiClientError(error);
        }

        config.headers.set('Authorization', `Bearer ${token}`);
        return this.instance.request(config);
      },
    );
  }

  /** Ensures only one refresh request is in flight at a time. */
  private async refreshOnce(): Promise<string | null> {
    this.refreshPromise ??= (async () => {
      try {
        return (await this.options.refreshAccessToken?.()) ?? null;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /** Escape hatch for interceptors, uploads and cancellation tokens. */
  get raw(): AxiosInstance {
    return this.instance;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<ApiSuccess<T>>(url, config);
    return response.data.data;
  }

  /** Like `get`, but keeps the pagination envelope. */
  async getPaginated<T>(url: string, config?: AxiosRequestConfig): Promise<Paginated<T>> {
    const response = await this.instance.get<ApiSuccess<T[]>>(url, config);
    const { data, meta } = response.data;
    return {
      data,
      meta: meta ?? {
        page: 1,
        limit: data.length,
        total: data.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  async post<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<ApiSuccess<T>>(url, body, config);
    return response.data.data;
  }

  async patch<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.patch<ApiSuccess<T>>(url, body, config);
    return response.data.data;
  }

  async put<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put<ApiSuccess<T>>(url, body, config);
    return response.data.data;
  }

  async delete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<ApiSuccess<T>>(url, config);
    return response.data.data;
  }

  /**
   * Fetches a binary document (PDF, CSV). These endpoints answer with the file
   * itself rather than the JSON envelope, so the response body is returned
   * untouched. An error still arrives as JSON, so it is decoded back into the
   * usual envelope before the interceptor sees it.
   */
  async download(url: string, config?: AxiosRequestConfig): Promise<Blob> {
    const response = await this.instance.get<Blob>(url, {
      ...config,
      responseType: 'blob',
      // The envelope interceptor must not try to unwrap a binary body.
      transformResponse: (body: unknown) => body,
    });

    return response.data;
  }

  /** Multipart upload used by the tour gallery and blog cover image. */
  async upload<T>(url: string, file: File, fieldName = 'file'): Promise<T> {
    const formData = new FormData();
    formData.append(fieldName, file);
    const response = await this.instance.post<ApiSuccess<T>>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  }
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  return new HttpClient(options);
}
