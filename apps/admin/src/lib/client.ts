'use client';
import { useCallback, useEffect, useState } from 'react';

export class AdminApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

/** Calls the API through this portal's same-origin proxy (cookies carry the session). */
export async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ data: T; meta?: { nextCursor: string | null; hasMore: boolean; total?: number } }> {
  const r = await fetch(`/api/proxy/${path.replace(/^\//, '')}`, {
    method: init.method ?? 'GET',
    headers: { 'x-vicinity-admin': '1', ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const json = await r.json().catch(() => ({}));
  if (r.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!r.ok) throw new AdminApiError(json?.error?.message ?? 'Request failed', r.status, json?.error?.code ?? 'ERROR');
  return json;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
}

/** Minimal data hook with loading/error/retry. */
export function useAdmin<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; meta?: { nextCursor: string | null; hasMore: boolean; total?: number }; error?: AdminApiError; loading: boolean }>({ loading: true });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const r = await adminApi<T>(path);
      setState({ data: r.data, meta: r.meta, loading: false });
    } catch (e) {
      setState({ error: e as AdminApiError, loading: false });
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}

/** Cursor-paginated list: append pages with loadMore(). */
export function usePaged<T>(path: string) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminApiError | null>(null);

  const fetchPage = useCallback(
    async (c: string | null, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const sep = path.includes('?') ? '&' : '?';
        const r = await adminApi<T[]>(`${path}${c ? `${sep}cursor=${encodeURIComponent(c)}` : ''}`);
        setItems((prev) => (append ? [...prev, ...r.data] : r.data));
        setCursor(r.meta?.nextCursor ?? null);
        setHasMore(!!r.meta?.hasMore);
      } catch (e) {
        setError(e as AdminApiError);
      } finally {
        setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  return { items, loading, error, hasMore, loadMore: () => fetchPage(cursor, true), reload: () => fetchPage(null, false) };
}
