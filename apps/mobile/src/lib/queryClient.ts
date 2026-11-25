import { QueryClient } from '@tanstack/react-query';
import type { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, error) => {
        const e = error as unknown as ApiError;
        if (e?.status && e.status >= 400 && e.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});
