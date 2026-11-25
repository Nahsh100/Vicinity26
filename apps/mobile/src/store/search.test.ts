import { beforeEach, describe, expect, it } from 'vitest';
import { activeFilterCount, useSearch } from './search';

describe('search store', () => {
  beforeEach(() => useSearch.getState().reset());

  it('combines filters and counts the active ones', () => {
    useSearch.getState().setFilters({ categoryId: 'c1', categoryName: 'Plumbing', maxPrice: 200, verified: true });
    expect(activeFilterCount(useSearch.getState().filters)).toBe(3);
  });

  it('clearing an organization also clears its group', () => {
    useSearch.getState().setFilters({ organizationId: 'o1', organizationName: 'Church', groupId: 'g1', groupName: 'Youth' });
    useSearch.getState().clearFilter('organizationId');
    const f = useSearch.getState().filters;
    expect(f.organizationId).toBeUndefined();
    expect(f.groupId).toBeUndefined();
    expect(f.groupName).toBeUndefined();
  });

  it('keeps the query and filters until reset', () => {
    useSearch.getState().setQuery('plumber');
    useSearch.getState().setFilters({ sort: 'distance' });
    expect(useSearch.getState()).toMatchObject({ query: 'plumber', filters: { sort: 'distance' } });
    useSearch.getState().reset();
    expect(useSearch.getState()).toMatchObject({ query: '', filters: { sort: 'relevance' } });
  });
});
