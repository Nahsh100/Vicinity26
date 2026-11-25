import { create } from 'zustand';
import type { SearchParams } from '@vicinity/shared';

export type SearchFilters = Omit<SearchParams, 'lat' | 'lng' | 'cursor' | 'limit' | 'q' | 'radiusKm'> & {
  /** Display names for chips; ids are what the API receives. */
  categoryName?: string;
  organizationName?: string;
  groupName?: string;
};

interface SearchState {
  query: string;
  filters: SearchFilters;
  view: 'list' | 'map';
  setQuery(q: string): void;
  setFilters(f: Partial<SearchFilters>): void;
  clearFilter(k: keyof SearchFilters): void;
  reset(): void;
  setView(v: 'list' | 'map'): void;
}

/** Search query and filters persist while navigating between results, profiles and back. */
export const useSearch = create<SearchState>((set) => ({
  query: '',
  filters: { sort: 'relevance' },
  view: 'list',
  setQuery: (query) => set({ query }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  clearFilter: (k) =>
    set((s) => {
      const next = { ...s.filters };
      delete next[k];
      if (k === 'categoryId') delete next.categoryName;
      if (k === 'organizationId') {
        delete next.organizationName;
        delete next.groupId;
        delete next.groupName;
      }
      if (k === 'groupId') delete next.groupName;
      return { filters: next };
    }),
  reset: () => set({ query: '', filters: { sort: 'relevance' } }),
  setView: (view) => set({ view }),
}));

export function activeFilterCount(f: SearchFilters): number {
  const keys: (keyof SearchFilters)[] = ['categoryId', 'listingType', 'minPrice', 'maxPrice', 'organizationId', 'groupId', 'minRating', 'verified', 'availableOnly', 'providerType'];
  return keys.filter((k) => f[k] !== undefined && f[k] !== false).length;
}
