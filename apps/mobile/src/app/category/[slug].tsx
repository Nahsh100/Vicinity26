import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors, type ListingSummary } from '@vicinity/shared';
import { ListingCard, ListingRow } from '@/components/Cards';
import { openCategory, TILE_TINTS } from '@/components/CategoryGrid';
import { Screen, useWide } from '@/components/Screen';
import { Button, EmptyState, ErrorState, Icon, ListSkeleton, Txt } from '@/components/ui';
import { useCategory } from '@/hooks/api';
import { api, cleanParams } from '@/lib/api';
import { useLocation } from '@/store/location';
import { useSearch } from '@/store/search';

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const cat = useCategory(slug);
  const wide = useWide();
  const { location, radiusKm } = useLocation();
  const c = cat.data;
  const top = useQuery({
    queryKey: ['category-top', c?.id, location?.lat, location?.lng, radiusKm],
    queryFn: () => api.page<ListingSummary>('/search', cleanParams({ categoryId: c!.id, lat: location?.lat, lng: location?.lng, radiusKm: location ? radiusKm : undefined, limit: 12 })).then((r) => r.items),
    enabled: !!c,
  });

  const searchAll = () => {
    if (!c) return;
    useSearch.setState((s) => ({ query: '', filters: { ...s.filters, categoryId: c.id, categoryName: c.parentId ? c.name : `All ${c.name}` } }));
    router.push('/search');
  };

  return (
    <Screen back title={c?.name ?? ''} maxWidth="max-w-5xl">
      {cat.isLoading ? <View className="px-margin"><ListSkeleton /></View> : cat.isError ? <ErrorState error={cat.error} onRetry={() => void cat.refetch()} /> : null}
      {c ? (
        <View className="gap-5 px-margin">
          <View className="gap-3 overflow-hidden rounded-panel bg-primary-dark p-5">
            <View className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
            <View className="flex-row items-center gap-3">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <Icon name={c.icon ?? 'category'} size={28} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Txt variant="headline-md" className="text-white">{c.name}</Txt>
                <Txt variant="body-sm" className="text-white/80">
                  {c.listingCount ? `${c.listingCount} live listing${c.listingCount === 1 ? '' : 's'}` : 'Be the first to list here'}
                  {location ? ` · near ${location.label}` : ''}
                </Txt>
              </View>
            </View>
            {c.description ? <Txt variant="body-md" className="text-white/85">{c.description}</Txt> : null}
            <Button title={`Search all ${c.name}`} kind="white" icon="search" onPress={searchAll} className="self-start" />
          </View>

          {c.children?.length ? (
            <View className="gap-3">
              <Txt variant="headline-sm">Browse by speciality</Txt>
              <View className="-mx-1 flex-row flex-wrap gap-y-2">
                {c.children.map((ch, i) => {
                  const t = TILE_TINTS[i % TILE_TINTS.length]!;
                  return (
                    <View key={ch.id} className={`px-1 ${wide ? 'w-1/4' : 'w-1/2'}`}>
                      <Pressable onPress={() => openCategory(ch, false)} accessibilityRole="button" className="flex-row items-center gap-3 rounded-2xl bg-white p-3 shadow-card active:opacity-80">
                        <View style={{ backgroundColor: t.bg }} className="h-10 w-10 items-center justify-center rounded-xl">
                          <Icon name={c.icon ?? 'category'} size={20} color={t.fg} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Txt variant="label-lg" numberOfLines={2}>{ch.name}</Txt>
                          <Txt variant="label-sm" className="text-on-surface-variant">{ch.listingCount ?? 0} listed</Txt>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View className="flex-row items-center justify-between">
            <Txt variant="headline-sm">{location ? `Near ${location.label}` : 'Popular listings'}</Txt>
            {top.data?.length ? (
              <Pressable onPress={searchAll} className="flex-row items-center gap-1">
                <Txt variant="label-lg" className="text-primary-dark">See all</Txt>
                <Icon name="arrow_forward" size={16} color={colors.primaryDark} />
              </Pressable>
            ) : null}
          </View>
          {top.isLoading ? (
            <ListSkeleton rows={3} />
          ) : top.data?.length ? (
            wide ? (
              <View className="-mx-2 flex-row flex-wrap gap-y-4">
                {top.data.map((l) => (
                  <View key={l.id} className="w-1/3 px-2"><ListingCard l={l} /></View>
                ))}
              </View>
            ) : (
              <View className="gap-3">{top.data.map((l) => <ListingRow key={l.id} l={l} />)}</View>
            )
          ) : (
            <EmptyState
              icon="travel_explore"
              title={`No ${c.name.toLowerCase()} listings nearby yet`}
              message="Try a wider radius, or list your own service."
              action={{ label: 'Offer this service', onPress: () => router.push('/become-provider') }}
            />
          )}
        </View>
      ) : null}
    </Screen>
  );
}
