import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiErrorBody, AuthTokens, PageMeta } from '@vicinity/shared';
import { secureStorage } from './storage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const REFRESH_KEY = 'vicinity.refreshToken';

let accessToken: string | null = null;
let onSessionEnded: (() => void) | null = null;

export const tokens = {
  setAccess(t: string | null) {
    accessToken = t;
  },
  hasAccess: () => !!accessToken,
  async save(t: AuthTokens) {
    accessToken = t.accessToken;
    await secureStorage.set(REFRESH_KEY, t.refreshToken);
  },
  getRefresh: () => secureStorage.get(REFRESH_KEY),
  async clear() {
    accessToken = null;
    await secureStorage.remove(REFRESH_KEY);
  },
  /** Called when refresh fails, so the auth store can sign the user out. */
  onSessionEnded(cb: () => void) {
    onSessionEnded = cb;
  },
};

export const http = axios.create({ baseURL: `${API_URL}/api/v1`, timeout: 20_000 });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/** One in-flight refresh shared by all requests that hit 401 at the same time (rotation is single-use). */
let refreshing: Promise<string | null> | null = null;

export async function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    const rt = await tokens.getRefresh();
    if (!rt) return null;
    try {
      const r = await axios.post<{ data: AuthTokens }>(`${API_URL}/api/v1/auth/refresh`, { refreshToken: rt }, { timeout: 15_000 });
      await tokens.save(r.data.data);
      return r.data.data.accessToken;
    } catch (e) {
      // Only end the session when the server rejected the token, not on network failures.
      if ((e as AxiosError).response?.status === 401) {
        await tokens.clear();
        onSessionEnded?.();
      }
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

http.interceptors.response.use(undefined, async (error: AxiosError<ApiErrorBody>) => {
  const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (error.response?.status === 401 && original && !original._retried && !original.url?.includes('/auth/')) {
    original._retried = true;
    const t = await refreshSession();
    if (t) {
      original.headers = { ...original.headers, Authorization: `Bearer ${t}` };
      return http(original);
    }
  }
  throw toApiError(error);
});

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number | null,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === null;
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const ax = e as AxiosError<ApiErrorBody>;
  if (ax?.isAxiosError) {
    if (!ax.response) return new ApiError("Can't reach Vicinity. Check your connection and try again.", 'NETWORK', null);
    const body = ax.response.data?.error;
    return new ApiError(body?.message ?? 'Something went wrong', body?.code ?? 'ERROR', ax.response.status, body?.details);
  }
  return new ApiError((e as Error)?.message ?? 'Something went wrong', 'ERROR', null);
}

/** Typed helpers that unwrap the { data } envelope. */
export const api = {
  async get<T>(url: string, params?: object): Promise<T> {
    return (await http.get<{ data: T }>(url, { params })).data.data;
  },
  async page<T>(url: string, params?: object): Promise<{ items: T[]; meta: PageMeta & Record<string, unknown> }> {
    const r = await http.get<{ data: T[]; meta: PageMeta & Record<string, unknown> }>(url, { params });
    return { items: r.data.data, meta: r.data.meta };
  },
  async post<T>(url: string, body?: unknown): Promise<T> {
    return (await http.post<{ data: T }>(url, body ?? {})).data.data;
  },
  async put<T>(url: string, body?: unknown): Promise<T> {
    return (await http.put<{ data: T }>(url, body ?? {})).data.data;
  },
  async patch<T>(url: string, body?: unknown): Promise<T> {
    return (await http.patch<{ data: T }>(url, body ?? {})).data.data;
  },
  async del<T>(url: string): Promise<T> {
    return (await http.delete<{ data: T }>(url)).data.data;
  },
};

/** Strips undefined/empty values so query strings stay clean. */
export function cleanParams<T extends object>(p: T): Partial<T> {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;
}
