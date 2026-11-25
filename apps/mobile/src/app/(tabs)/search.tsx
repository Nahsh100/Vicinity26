import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, type ListingSummary, type SearchMeta } from '@vicinity/shared';
import { AppHeader } from '@/components/AppHeader';
import { BookingSheet } from '@/components/BookingPanel';
import { ListingCard } from '@/components/Cards';
import { FilterSheet } from '@/components/FilterSheet';
import { LocationSheet } from '@/components/LocationSheet';
import { NearbyMap } from '@/components/NearbyMap';
import { useWide } from '@/components/Screen';
import { Chip, EmptyState, ErrorState, Icon, ListSkeleton, Notice, Txt } from '@/components/ui';
import { useRecentSearches, useSearchResults, useSuggest } from '@/hooks/api';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { activeFilterCount, useSearch } from '@/store/search';

const SORT_LABEL = { relevance: 'Best Match', distance: 'Nearest', rating: 'Top Rated', price_asc: 'Lowest Price', price_desc: 'Highest Price', newest: 'Newest' } as const;
const SORT_ORDER = ['relevance', 'distance', 'rating', 'price_asc', 'newest'] as const;

/** Search & Results (Stitch mobile "Search & Results" and web "Search & Map Explorer"). */
export default function Search() {
  const wide = useWide();
  const { query, filters, view, setQuery, setFilters, clearFilter, setView } = useSearch();
  const { location, radiusKm, useGps, setRadius } = useLocation();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const [input, setInput] = useState(query);
  const [typing, setTyping] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [booking, setBooking] = useState<ListingSummary | null>(null);
  const qc = useQueryClient();

  const results = useSearchResults();
  const suggest = useSuggest(typing ? input : '');
  const recent = useRecentSearches();
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);
  const meta = results.data?.pages[0]?.meta as SearchMeta | undefined;
  const total = meta?.total ?? items.length;

  const submit = (q: string) => {
    setInput(q);
    setQuery(q);
    setTyping(false);
  };
  const sortNext = () => {
    const cur = filters.sort ?? 'relevance';
    setFilters({ sort: SORT_ORDER[(SORT_ORDER.indexOf(cur as (typeof SORT_ORDER)[number]) + 1) % SORT_ORDER.length] });
  };
  const areas = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of items) if (l.area) m.set(l.area, (m.get(l.area) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);
  const resultNoun = filters.categoryName?.replace(/^All /, '') ?? (query ? `“${query}”` : 'results');

  const showSuggestions = typing && input.trim().length > 0;
  const showRecent = typing && !input.trim() && signedIn && (recent.data?.length ?? 0) > 0;

  const searchInput = (big: boolean) => (
    <View className={`${big ? 'h-12 px-5' : 'h-11 px-3'} flex-1 flex-row items-center rounded-full bg-surface-container-low`}>
      <Icon name="search" size={20} color={colors.outline} />
      <TextInput
        value={input}
        onChangeText={(t) => {
          setInput(t);
          setTyping(true);
          if (!t) setQuery('');
        }}
        onFocus={() => setTyping(true)}
        onSubmitEditing={() => submit(input)}
        returnKeyType="search"
        autoCorrect={false}
        placeholder="Search services or products..."
        placeholderTextColor={colors.outline}
        accessibilityLabel="Search"
        className="ml-2 flex-1 font-sans text-body-lg text-on-surface"
        style={{ outlineStyle: 'none' } as never}
      />
      {input ? (
        <Pressable accessibilityLabel="Clear search" onPress={() => submit('')} hitSlop={8}>
          <Icon name="cancel" size={18} color={colors.outline} />
        </Pressable>
      ) : null}
    </View>
  );

  const suggestions = (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName={`w-full ${wide ? 'max-w-3xl' : ''} self-center px-margin py-3 gap-1`}>
      {showRecent ? (
        <>
          <View className="flex-row items-center justify-between pb-1">
            <Txt variant="eyebrow" className="text-on-surface-variant">Recent searches</Txt>
            <Pressable onPress={() => void api.del('/users/me/recent-searches').then(() => qc.invalidateQueries({ queryKey: ['recent-searches'] }))} accessibilityRole="button">
              <Txt variant="label-md" className="text-primary-dark">Clear</Txt>
            </Pressable>
          </View>
          {recent.data!.map((r) => <SuggestionRow key={r} icon="history" label={r} onPress={() => submit(r)} />)}
        </>
      ) : null}
      {showSuggestions ? (
        <>
          <SuggestionRow icon="search" label={`Search for “${input.trim()}”`} onPress={() => submit(input.trim())} />
          {suggest.data?.categories.map((c) => (
            <SuggestionRow
              key={c.id}
              icon={c.icon ?? 'category'}
              label={c.name}
              sub={c.matched.toLowerCase() !== c.name.toLowerCase() ? `Category · matches “${c.matched}”` : 'Category'}
              onPress={() => {
                setFilters({ categoryId: c.id, categoryName: c.name });
                submit('');
              }}
            />
          ))}
          {suggest.data?.listings.map((t) => <SuggestionRow key={t} icon="sell" label={t} onPress={() => submit(t)} />)}
          {suggest.data?.providers.map((p) => <SuggestionRow key={p.id} icon="storefront" label={p.displayName} sub="Provider" onPress={() => router.push(`/provider/${p.slug}`)} />)}
        </>
      ) : null}
      <Pressable onPress={() => setTyping(false)} className="mt-2 self-center px-4 py-2">
        <Txt variant="label-md" className="text-on-surface-variant">Show results</Txt>
      </Pressable>
    </ScrollView>
  );

  const empty = results.isLoading ? (
    <View className="px-margin"><ListSkeleton /></View>
  ) : results.isError ? (
    <ErrorState error={results.error} onRetry={() => void results.refetch()} />
  ) : (
    <EmptyState
      title="No matches nearby"
      message={location ? `Try a wider radius than ${radiusKm} km, fewer filters, or different words.` : 'Try different words or set your location.'}
      action={location && radiusKm < 50 ? { label: `Search within ${Math.min(50, radiusKm * 2)} km`, onPress: () => setRadius(Math.min(50, radiusKm * 2)) } : undefined}
    />
  );

  // ───────── Desktop: filter bar + list/map split ─────────
  if (wide) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader />
        <View className="bg-white shadow-soft">
          <View className="w-full max-w-[1440px] gap-3 self-center px-8 py-4">
            <View className="flex-row items-center gap-3">
              {searchInput(true)}
              <Pressable onPress={() => setLocOpen(true)} className="h-12 flex-row items-center gap-2 rounded-full bg-surface-container-low px-5 active:bg-surface-container">
                <Icon name="radar" size={18} color={colors.primaryDark} />
                <Txt variant="label-lg">Radius: {radiusKm} km</Txt>
                <Icon name="expand_more" size={18} color={colors.onSurface} />
              </Pressable>
              <Pressable onPress={() => setFilterOpen(true)} className="h-12 flex-row items-center gap-2 rounded-full bg-surface-container-low px-5 active:bg-surface-container">
                <Icon name="payments" size={18} color={colors.primaryDark} />
                <Txt variant="label-lg">{filters.minPrice != null || filters.maxPrice != null ? `ZMW ${filters.minPrice ?? 0} – ${filters.maxPrice ?? '∞'}` : 'Any price'}</Txt>
                <Icon name="expand_more" size={18} color={colors.onSurface} />
              </Pressable>
              <View className="h-12 flex-row items-center gap-1 rounded-full bg-surface-container-low p-1">
                {(['relevance', 'distance', 'rating'] as const).map((s) => (
                  <Pressable key={s} onPress={() => setFilters({ sort: s })} className={`h-10 justify-center rounded-full px-4 ${(filters.sort ?? 'relevance') === s ? 'bg-primary-dark' : ''}`}>
                    <Txt variant="label-md" className={(filters.sort ?? 'relevance') === s ? 'text-white' : 'text-on-surface-variant'}>{SORT_LABEL[s]}</Txt>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setFilters({ verified: filters.verified ? undefined : true })} className="h-12 flex-row items-center gap-2 rounded-full bg-secondary-fixed/60 px-5">
                <Icon name={filters.verified ? 'check_box' : 'check_box_outline_blank'} size={20} color={colors.primaryDark} fill={!!filters.verified} />
                <Icon name="verified" size={17} color={colors.primaryDark} />
                <Txt variant="label-lg" className="text-primary-dark">Verified Pros</Txt>
              </Pressable>
              <Pressable onPress={() => setFilterOpen(true)} accessibilityLabel="More filters" className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-low">
                <Icon name="tune" size={20} color={colors.onSurface} />
                {activeFilterCount(filters) ? <View className="absolute right-1 top-1 h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1"><Txt variant="label-sm" className="text-white">{activeFilterCount(filters)}</Txt></View> : null}
              </Pressable>
            </View>
            <View className="flex-row items-center justify-between">
              <View className="flex-row flex-wrap items-center gap-2">
                <Txt variant="eyebrow" className="text-on-surface-variant">Neighbourhoods:</Txt>
                {areas.length ? (
                  areas.map(([a, n], i) => (
                    <View key={a} className={`h-7 flex-row items-center gap-1 rounded-full px-3 ${i === 0 ? 'bg-secondary-fixed/60' : 'bg-surface-container-low'}`}>
                      <Txt variant="label-md" className={i === 0 ? 'text-primary-dark' : 'text-on-surface'}>{a} ({n})</Txt>
                    </View>
                  ))
                ) : (
                  <Txt variant="body-sm" className="text-on-surface-variant">—</Txt>
                )}
                {filters.categoryName ? <Chip label={filters.categoryName} active onClear={() => clearFilter('categoryId')} /> : null}
                {filters.organizationName ? <Chip icon="groups" label={filters.groupName ? `${filters.organizationName} · ${filters.groupName}` : filters.organizationName} active onClear={() => clearFilter('organizationId')} /> : null}
              </View>
              <Txt variant="body-sm" className="text-on-surface-variant">
                Showing {total} {location ? `within ${radiusKm} km of ${location.label}` : 'across Zambia'}
              </Txt>
            </View>
          </View>
        </View>

        {showSuggestions || showRecent ? (
          suggestions
        ) : (
          <View className="w-full max-w-[1440px] flex-1 flex-row gap-6 self-center px-8 pt-5">
            <View className="flex-[1.05]">
              <FlatList
                data={items}
                keyExtractor={(l) => l.id}
                showsVerticalScrollIndicator={false}
                contentContainerClassName="pb-10"
                ItemSeparatorComponent={() => <View className="h-3" />}
                onEndReachedThreshold={0.4}
                onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && void results.fetchNextPage()}
                ListHeaderComponent={
                  <View className="gap-3 pb-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <Txt variant="headline-md">{results.isLoading ? 'Searching…' : `${total} ${resultNoun}`}</Txt>
                        <View className="flex-row items-center gap-1">
                          <View className="h-2 w-2 rounded-full bg-primary" />
                          <Txt variant="label-md" className="text-primary-dark">{items.filter((i) => i.isAvailable).length} available now</Txt>
                        </View>
                      </View>
                      <Pressable onPress={sortNext} className="flex-row items-center gap-1">
                        <Txt variant="label-md" className="text-on-surface-variant">Sort by:</Txt>
                        <Txt variant="label-md" className="text-primary-dark">{SORT_LABEL[filters.sort ?? 'relevance']}</Txt>
                        <Icon name="expand_more" size={18} color={colors.primaryDark} />
                      </Pressable>
                    </View>
                    {meta?.sponsored?.length ? (
                      <View className="gap-2">
                        <Txt variant="eyebrow" className="text-on-surface-variant">Sponsored</Txt>
                        {meta.sponsored.map((l) => <ListingCard key={`s-${l.id}`} l={l} onBook={() => setBooking(l)} />)}
                      </View>
                    ) : null}
                  </View>
                }
                renderItem={({ item, index }) => (
                  <View>
                    {index === 0 && (filters.sort ?? 'relevance') !== 'price_asc' ? (
                      <View className="absolute -top-3 right-6 z-10 rounded-full bg-primary-dark px-3 py-1">
                        <Txt variant="label-sm" className="text-white">NEARBY TOP PICK</Txt>
                      </View>
                    ) : null}
                    <ListingCard l={item} highlight={index === 0} onBook={() => setBooking(item)} />
                  </View>
                )}
                ListEmptyComponent={empty}
              />
            </View>
            <View className="flex-1 pb-6">
              <NearbyMap origin={location} radiusKm={radiusKm} items={items.slice(0, 30)} height={640} explorer onRecenter={() => void useGps()} />
            </View>
          </View>
        )}
        <FilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} />
        <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
        {booking ? (
          <BookingSheet visible providerId={booking.provider.id} providerName={booking.provider.displayName} serviceMode={booking.provider.serviceMode} initialListingId={booking.id} onClose={() => setBooking(null)} />
        ) : null}
      </View>
    );
  }

  // ───────── Mobile ─────────
  const header = (
    <View className="gap-2">
      {meta?.matchedCategories?.length && query ? (
        <View className="flex-row flex-wrap items-center gap-1.5 px-margin">
          <Txt variant="body-sm" className="text-on-surface-variant">Including</Txt>
          {meta.matchedCategories.slice(0, 3).map((c) => (
            <Chip key={c.id} label={c.name} onPress={() => setFilters({ categoryId: c.id, categoryName: c.name })} />
          ))}
        </View>
      ) : null}
      <View className="px-margin pt-1">
        <NearbyMap origin={location} radiusKm={radiusKm} items={items.slice(0, 25)} height={view === 'map' ? 440 : 192} onRecenter={() => void useGps()} />
      </View>
      {meta?.sponsored?.length ? (
        <View className="gap-2 px-margin pt-2">
          <Txt variant="eyebrow" className="text-on-surface-variant">Sponsored</Txt>
          {meta.sponsored.map((l) => <ListingCard key={`s-${l.id}`} l={l} />)}
        </View>
      ) : null}
      <View className="flex-row items-center justify-between px-margin pb-1 pt-2">
        <View className="flex-row items-baseline gap-1.5">
          <Txt variant="headline-sm">{results.isLoading ? 'Searching…' : `${total} result${total === 1 ? '' : 's'}`}</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">{location ? 'near you' : 'across Zambia'}</Txt>
        </View>
        <Pressable onPress={sortNext} accessibilityRole="button" accessibilityLabel="Change sort order" className="flex-row items-center gap-0.5 rounded-full px-1 py-1">
          <Txt variant="label-md" className="text-on-surface-variant">Sort by:</Txt>
          <Txt variant="label-md" className="font-bold text-primary-dark">{SORT_LABEL[filters.sort ?? 'relevance']}</Txt>
          <Icon name="expand_more" size={18} color={colors.primaryDark} />
        </Pressable>
      </View>
      {!location ? (
        <View className="px-margin">
          <Notice message="Set your location to see what's closest to you." icon="location_on" />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <View className="gap-2 bg-white px-margin pb-2.5 pt-1.5 shadow-soft">
        <View className="flex-row items-center gap-2">
          <Pressable accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-container">
            <Icon name="arrow_back" size={22} color={colors.onSurface} />
          </Pressable>
          {searchInput(false)}
          <Pressable accessibilityLabel={`Filters${activeFilterCount(filters) ? `, ${activeFilterCount(filters)} active` : ''}`} onPress={() => setFilterOpen(true)} className="h-11 w-11 items-center justify-center rounded-full bg-surface-container-low shadow-soft active:scale-95">
            <Icon name="tune" size={20} color={colors.onSurface} />
            {activeFilterCount(filters) ? <View className="absolute -right-0.5 -top-0.5 h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1"><Txt variant="label-sm" className="text-white">{activeFilterCount(filters)}</Txt></View> : null}
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 py-0.5" keyboardShouldPersistTaps="handled">
          <Chip icon="near_me" label={`${radiusKm} km`} active trailing onPress={() => setLocOpen(true)} />
          <Chip label={filters.minPrice != null || filters.maxPrice != null ? `ZMW ${filters.minPrice ?? 0}–${filters.maxPrice ?? '∞'}` : 'Price'} active={filters.minPrice != null || filters.maxPrice != null} trailing onPress={() => setFilterOpen(true)} />
          {filters.categoryName ? <Chip label={filters.categoryName} active onClear={() => clearFilter('categoryId')} /> : <Chip label="Category" trailing onPress={() => setFilterOpen(true)} />}
          <Chip icon="verified" label="Verified" active={!!filters.verified} onPress={() => setFilters({ verified: filters.verified ? undefined : true })} />
          {filters.listingType ? <Chip label={filters.listingType === 'SERVICE' ? 'Services' : 'Products'} active onClear={() => clearFilter('listingType')} /> : null}
          {filters.minRating ? <Chip label={`${filters.minRating}+ ★`} active onClear={() => clearFilter('minRating')} /> : null}
          {filters.organizationName ? <Chip icon="groups" label={filters.groupName ? `${filters.organizationName} · ${filters.groupName}` : filters.organizationName} active onClear={() => clearFilter('organizationId')} /> : null}
          <Chip label="More" trailing onPress={() => setFilterOpen(true)} />
        </ScrollView>
      </View>

      {showSuggestions || showRecent ? (
        suggestions
      ) : (
        <FlatList<ListingSummary>
          data={view === 'map' ? [] : items}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <View className="px-margin"><ListingCard l={item} /></View>}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          ListHeaderComponent={header}
          contentContainerClassName="pb-28"
          onEndReachedThreshold={0.4}
          onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && void results.fetchNextPage()}
          refreshing={results.isRefetching && !results.isFetchingNextPage}
          onRefresh={() => void results.refetch()}
          ListEmptyComponent={view === 'map' ? undefined : empty}
          ListFooterComponent={results.isFetchingNextPage ? <View className="px-margin pt-2"><ListSkeleton rows={1} /></View> : undefined}
        />
      )}

      <View className="absolute bottom-6 left-0 right-0 items-center" pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel={view === 'list' ? 'Show map' : 'Show list'} onPress={() => setView(view === 'list' ? 'map' : 'list')} className="flex-row items-center gap-1.5 rounded-full bg-navy px-5 py-3 shadow-raised">
          <Icon name={view === 'list' ? 'map' : 'view_list'} size={18} color="#fff" />
          <Txt variant="label-lg" className="text-white">{view === 'list' ? 'Map' : 'List'}</Txt>
        </Pressable>
      </View>

      <FilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} />
      <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
    </SafeAreaView>
  );
}

function SuggestionRow({ icon, label, sub, onPress }: { icon: string; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-3 rounded-2xl px-2 py-3 active:bg-surface-container-low">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-container-low">
        <Icon name={icon} size={18} color={colors.primaryDark} />
      </View>
      <View className="flex-1">
        <Txt variant="label-lg" numberOfLines={1}>{label}</Txt>
        {sub ? <Txt variant="body-sm" className="text-on-surface-variant">{sub}</Txt> : null}
      </View>
      <Icon name="north_west" size={16} color={colors.outline} />
    </Pressable>
  );
}

