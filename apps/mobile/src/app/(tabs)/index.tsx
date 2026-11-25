import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { colors, type Category } from '@vicinity/shared';
import { AppHeader } from '@/components/AppHeader';
import { ListingRow, ProviderCard, ProviderTile } from '@/components/Cards';
import { CategoryCards, CategoryGrid, openCategory } from '@/components/CategoryGrid';
import { LocationSheet } from '@/components/LocationSheet';
import { NearbyMap } from '@/components/NearbyMap';
import { Screen, useWide } from '@/components/Screen';
import { Button, EmptyState, ErrorState, Icon, ListSkeleton, SectionHeader, Skeleton, Txt } from '@/components/ui';
import { WebFooter } from '@/components/WebFooter';
import { useHome, usePublicStats, type HomeData } from '@/hooks/api';
import { useLocation } from '@/store/location';
import { useSearch } from '@/store/search';

function goSearch(q = '', sort?: 'rating' | 'newest' | 'relevance') {
  useSearch.setState((s) => ({ query: q, filters: { ...s.filters, ...(sort ? { sort } : {}) } }));
  router.push('/search');
}

/** Most-listed subcategories, for "Popular" quick chips. */
function popularSubcategories(tree: Category[] | undefined, n: number) {
  return (tree ?? [])
    .flatMap((p) => p.children ?? [])
    .filter((c) => (c.listingCount ?? 0) > 0)
    .sort((a, b) => (b.listingCount ?? 0) - (a.listingCount ?? 0))
    .slice(0, n);
}

export default function Home() {
  const wide = useWide();
  const home = useHome();
  return (
    <View className="flex-1 bg-surface">
      <AppHeader />
      {wide ? <WebHome home={home} /> : <MobileHome home={home} />}
    </View>
  );
}

type HomeQuery = ReturnType<typeof useHome>;

/** Stitch "Vicinity - Home Discovery". */
function MobileHome({ home }: { home: HomeQuery }) {
  const { location, useGps } = useLocation();
  const [locOpen, setLocOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const d = home.data;

  const locate = async () => {
    setLocating(true);
    const r = await useGps();
    setLocating(false);
    if (!r) setLocOpen(true);
  };

  return (
    <>
      <Screen nav={false} edges={[]} maxWidth="max-w-2xl" refreshing={home.isRefetching} onRefresh={() => void home.refetch()}>
        <View className="px-margin pb-1 pt-2">
          <Pressable
            accessibilityRole="search"
            accessibilityLabel="Search for services or products"
            onPress={() => router.push('/search')}
            className="h-12 flex-row items-center rounded-full bg-white px-4 shadow-card"
          >
            <Icon name="search" size={20} color={colors.outline} />
            <Txt variant="body-md" className="ml-3 flex-1 text-outline">Search for services or products...</Txt>
            <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-container-low">
              <Icon name="tune" size={18} color={colors.primaryDark} />
            </View>
          </Pressable>
        </View>

        <View className="px-margin py-3">
          <CategoryGrid categories={d?.categories} loading={home.isLoading} />
        </View>

        <View className="px-margin py-2">
          <View className="overflow-hidden rounded-2xl bg-surface-container-low shadow-soft">
            <View className="flex-row items-center justify-between gap-3 bg-gradient-to-r from-white via-white/80 to-transparent p-4">
              <View className="flex-1 flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-error-container/70">
                  <Icon name="location_on" size={24} color={colors.error} />
                </View>
                <View className="flex-1">
                  <Txt variant="headline-sm">{location ? `Near ${location.label}` : 'Find services near you'}</Txt>
                  <Txt variant="body-sm" className="text-on-surface-variant">{location ? 'Tap to change your area or radius' : 'Instant matches in your suburb'}</Txt>
                </View>
              </View>
              {location ? (
                <Button title="Change" kind="soft" size="sm" icon="edit_location_alt" onPress={() => setLocOpen(true)} />
              ) : (
                <Button title={locating ? 'Locating…' : 'Use Location'} size="sm" icon="my_location" loading={locating} onPress={() => void locate()} />
              )}
            </View>
          </View>
        </View>

        {home.isError ? (
          <ErrorState error={home.error} onRetry={() => void home.refetch()} />
        ) : (
          <>
            <View className="py-2">
              <SectionHeader title="Top Rated Providers" live action="See all" onAction={() => goSearch('', 'rating')} />
              {home.isLoading ? (
                <View className="flex-row gap-gutter px-margin py-2">
                  {[0, 1].map((i) => <Skeleton key={i} className="h-56 w-48 rounded-2xl" />)}
                </View>
              ) : d?.topRated.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-gutter px-margin pb-3 pt-1" snapToInterval={202} decelerationRate="fast">
                  {d.topRated.map((p) => <ProviderCard key={p.id} p={p} />)}
                </ScrollView>
              ) : (
                <Txt variant="body-md" className="px-margin py-3 text-on-surface-variant">Rated providers will appear here as reviews come in.</Txt>
              )}
            </View>

            {d?.featured.length ? (
              <View className="gap-gutter px-margin pb-4">
                <View className="flex-row items-center gap-2">
                  <Txt variant="headline-md">Featured</Txt>
                  <View className="rounded-full bg-surface-container px-2 py-0.5"><Txt variant="label-sm" className="text-on-surface-variant">Sponsored</Txt></View>
                </View>
                {d.featured.map((l) => <ListingRow key={l.id} l={l} />)}
              </View>
            ) : null}

            <View className="gap-gutter px-margin pb-4 pt-1">
              <View className="flex-row items-center justify-between">
                <Txt variant="headline-md">Popular Right Now</Txt>
                <Txt variant="label-md" className="text-on-surface-variant">{location?.label ?? 'Zambia'}</Txt>
              </View>
              {home.isLoading ? (
                <ListSkeleton rows={3} />
              ) : d?.popular.length ? (
                d.popular.slice(0, 6).map((l) => <ListingRow key={l.id} l={l} />)
              ) : (
                <EmptyState title="Nothing listed here yet" message="Be the first: list your service or product." action={{ label: 'Become a provider', onPress: () => router.push('/become-provider') }} />
              )}
            </View>

            {d?.nearby.length ? (
              <View className="py-2">
                <SectionHeader title={`Near ${location?.label ?? 'you'}`} action="Map" onAction={() => goSearch('', 'relevance')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-gutter px-margin pb-3 pt-1">
                  {d.nearby.map((p) => <ProviderCard key={p.id} p={p} />)}
                </ScrollView>
              </View>
            ) : null}

            {d?.newListings.length ? (
              <View className="gap-gutter px-margin pb-4">
                <SectionHeader title="Recently Added" action="See all" onAction={() => goSearch('', 'newest')} />
                {d.newListings.slice(0, 4).map((l) => <ListingRow key={l.id} l={l} />)}
              </View>
            ) : null}

            <View className="mx-margin mb-6 flex-row items-center gap-3 rounded-3xl bg-gradient-to-br from-primary-dark to-primary p-4">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-white/15">
                <Icon name="storefront" size={24} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Txt variant="headline-sm" className="text-white">Offer a service locally?</Txt>
                <Txt variant="body-sm" className="text-white/80">Free storefront. Get found by people nearby.</Txt>
              </View>
              <Button title="Start" kind="white" size="sm" onPress={() => router.push('/become-provider')} />
            </View>
          </>
        )}
      </Screen>
      <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
    </>
  );
}

/** Stitch "Vicinity - Web Home Discovery". Every number shown is live data. */
function WebHome({ home }: { home: HomeQuery }) {
  const d: HomeData | undefined = home.data;
  const stats = usePublicStats().data;
  const { location, radiusKm, useGps } = useLocation();
  const [q, setQ] = useState('');
  const [locOpen, setLocOpen] = useState(false);
  const popular = useMemo(() => popularSubcategories(d?.categories, 5), [d?.categories]);
  const totalSubcategories = (d?.categories ?? []).reduce((s, c) => s + (c.children?.length ?? 0), 0) || stats?.categories || 0;

  return (
    <>
      <Screen nav={false} edges={[]} maxWidth="max-w-none" refreshing={home.isRefetching} onRefresh={() => void home.refetch()} contentClassName="pb-0">
        {/* Hero */}
        <View className="bg-gradient-to-br from-[#E3F8F4] via-[#F2F7FF] to-[#E7EEFF]">
          <View className="w-full max-w-[1280px] self-center px-10 pb-16 pt-14">
            <View className="flex-row items-start justify-between gap-10">
              <View className="max-w-[760px] flex-1 gap-5">
                <View className="flex-row items-center gap-2 self-start rounded-full bg-white px-4 py-2 shadow-soft">
                  <View className="h-2 w-2 rounded-full bg-primary-dark" />
                  <Txt variant="label-md" className="text-primary-dark">Zambia's neighbourhood directory</Txt>
                  <Txt variant="body-sm" className="text-outline">•</Txt>
                  <Txt variant="body-sm" className="text-on-surface-variant">{location ? `Serving ${location.label} & beyond` : 'Lusaka, Copperbelt & beyond'}</Txt>
                </View>
                <Txt variant="display" className="text-navy" style={{ fontSize: 52, lineHeight: 58 }}>
                  Find trusted local services and skills right in your neighbourhood.
                </Txt>
                <Txt variant="body-lg" className="max-w-[640px] text-on-surface-variant" style={{ fontSize: 17, lineHeight: 26 }}>
                  Connect directly with Zambian artisans, technicians, small businesses and independent pros. Compare prices, ratings and real work before you call.
                </Txt>
              </View>
              <View className="w-[340px] gap-4 rounded-3xl bg-white p-5 shadow-card">
                <View className="flex-row items-center justify-between">
                  <Txt variant="label-md" className="text-on-surface-variant">Live on Vicinity</Txt>
                  <View className="rounded-full bg-tertiary-fixed/60 px-2.5 py-0.5">
                    <Txt variant="label-sm" className="text-on-tertiary-fixed">{stats ? `${stats.providers} pros listed` : '…'}</Txt>
                  </View>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-soft"><Icon name="verified_user" size={20} color={colors.primaryDark} /></View>
                  <View>
                    <Txt variant="label-lg">{stats ? `${stats.verifiedProviders} verified providers` : 'Verified providers'}</Txt>
                    <Txt variant="body-sm" className="text-on-surface-variant">Identity and credentials checked by our team</Txt>
                  </View>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-amber-soft"><Icon name="star" size={20} color="#B45309" /></View>
                  <View>
                    <Txt variant="label-lg">{stats?.averageRating ? `${stats.averageRating} average rating` : 'Real customer reviews'}</Txt>
                    <Txt variant="body-sm" className="text-on-surface-variant">{stats ? `From ${stats.reviews} reviews` : 'One review per customer'}</Txt>
                  </View>
                </View>
              </View>
            </View>

            {/* Search panel */}
            <View className="mt-10 gap-4 rounded-3xl bg-white p-4 shadow-raised">
              <View className="flex-row items-center gap-3">
                <View className="h-16 flex-[1.3] flex-row items-center gap-3 rounded-full bg-surface-container-low px-6">
                  <Icon name="search" size={22} color={colors.outline} />
                  <View className="flex-1">
                    <Txt variant="label-sm" className="text-on-surface-variant">SERVICE OR SKILL</Txt>
                    <TextInput
                      value={q}
                      onChangeText={setQ}
                      onSubmitEditing={() => goSearch(q.trim())}
                      placeholder="e.g. Plumber, Hair Braiding, Solar Repair..."
                      placeholderTextColor={colors.placeholder}
                      className="font-sans text-body-lg text-on-surface"
                      style={{ outlineStyle: 'none' } as never}
                    />
                  </View>
                </View>
                <Pressable onPress={() => setLocOpen(true)} className="h-16 flex-1 flex-row items-center gap-3 rounded-full bg-surface-container-low px-6 active:bg-surface-container">
                  <Icon name="location_on" size={22} color={colors.primaryDark} />
                  <View className="flex-1">
                    <Txt variant="label-sm" className="text-on-surface-variant">AREA</Txt>
                    <Txt variant="body-lg" numberOfLines={1}>{location ? `${location.label} (within ${radiusKm} km)` : 'Choose your neighbourhood'}</Txt>
                  </View>
                  <Icon name="expand_more" size={20} color={colors.onSurface} />
                </Pressable>
                <Button title="Find Pros" kind="brand" icon="manage_search" size="lg" className="h-16 px-10" onPress={() => goSearch(q.trim())} />
              </View>
              {popular.length ? (
                <View className="flex-row flex-wrap items-center gap-2 px-2">
                  <Txt variant="label-sm" className="text-on-surface-variant">POPULAR:</Txt>
                  {popular.map((c) => (
                    <Pressable key={c.id} onPress={() => openCategory(c, false)} className="rounded-full bg-surface-container-low px-3 py-1 active:bg-surface-container">
                      <Txt variant="label-md" className="text-on-secondary-fixed-variant">{c.name}</Txt>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View className="w-full max-w-[1280px] gap-20 self-center px-10 pt-16">
          {/* Categories */}
          <View className="gap-6">
            <View className="flex-row items-end justify-between">
              <View className="gap-1">
                <Txt variant="eyebrow" className="text-primary-dark">Comprehensive directory</Txt>
                <Txt variant="headline-lg">Explore Services by Category</Txt>
              </View>
              <Pressable onPress={() => router.push('/categories')} className="flex-row items-center gap-1">
                <Txt variant="label-lg" className="text-primary-dark">View all {totalSubcategories} sub-categories</Txt>
                <Icon name="arrow_forward" size={18} color={colors.primaryDark} />
              </Pressable>
            </View>
            {home.isLoading ? <Skeleton className="h-36 w-full rounded-3xl" /> : <CategoryCards categories={d?.categories} />}
          </View>

          {/* Top rated */}
          <View className="gap-6">
            <View className="flex-row items-end justify-between">
              <View className="gap-1">
                <View className="flex-row items-center gap-1.5">
                  <View className="h-2 w-2 rounded-full bg-primary-dark" />
                  <Txt variant="eyebrow" className="text-primary-dark">Rated by local customers</Txt>
                </View>
                <Txt variant="headline-lg">Top Rated Pros {location ? `near ${location.label}` : 'in Zambia'}</Txt>
              </View>
              <Button title="See all" kind="soft" iconRight="arrow_forward" onPress={() => goSearch('', 'rating')} />
            </View>
            {home.isLoading ? (
              <View className="flex-row gap-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[420px] flex-1 rounded-3xl" />)}</View>
            ) : d?.topRated.length ? (
              <View className="flex-row gap-5">
                {d.topRated.slice(0, 4).map((p) => <ProviderTile key={p.id} p={p} />)}
                {Array.from({ length: Math.max(0, 4 - d.topRated.length) }).map((_, i) => <View key={`pad${i}`} className="flex-1" />)}
              </View>
            ) : (
              <EmptyState icon="star" title="No rated providers yet" message="Providers appear here once customers review them." />
            )}
          </View>

          {/* Map explorer */}
          <View className="flex-row items-center gap-10 rounded-[32px] bg-white p-8 shadow-card">
            <View className="flex-1 gap-5">
              <View className="flex-row items-center gap-1.5 self-start rounded-full bg-tertiary-fixed/60 px-3 py-1">
                <Icon name="radar" size={15} color="#002117" />
                <Txt variant="label-md" className="text-on-tertiary-fixed">Visual radius finder</Txt>
              </View>
              <Txt variant="headline-lg" style={{ fontSize: 30, lineHeight: 38 }}>Explore local pros on the {location?.label ?? 'neighbourhood'} map</Txt>
              <Txt variant="body-lg" className="text-on-surface-variant">
                Set your radius from 1 to 50 km, see who is closest, and compare prices at a glance. Works with GPS or by picking your neighbourhood.
              </Txt>
              <View className="flex-row gap-3">
                <Button title="Open Map Explorer" kind="brand" icon="map" onPress={() => { useSearch.getState().setView('map'); router.push('/search'); }} />
                <Button title="Use GPS Location" kind="soft" icon="my_location" onPress={() => void useGps()} />
              </View>
            </View>
            <View className="flex-1">
              <NearbyMap origin={location} radiusKm={radiusKm} items={[...(d?.popular ?? []), ...(d?.newListings ?? [])].filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i).slice(0, 12)} height={340} explorer />
            </View>
          </View>

          {/* How it works */}
          <View className="gap-8">
            <View className="items-center gap-2">
              <Txt variant="eyebrow" className="text-primary-dark">Simple & transparent</Txt>
              <Txt variant="headline-lg">How Vicinity Works for You</Txt>
              <Txt variant="body-lg" className="max-w-[620px] text-center text-on-surface-variant">
                From fixing a leaking pipe to finding fresh meat down the road — find, compare and contact local people in minutes.
              </Txt>
            </View>
            <View className="flex-row gap-6">
              {[
                { n: '01', t: 'Search Nearby & Compare', b: 'Filter by distance, price, rating and category. Every listing shows its real starting price in ZMW and reviews from customers.', f: 'Real customer reviews', i: 'reviews' },
                { n: '02', t: 'Connect & Book Directly', b: 'Call, WhatsApp or message providers in the app, and request a booking at a time that suits you. Providers confirm in the app.', f: 'In-app messages & bookings', i: 'forum' },
                { n: '03', t: 'Get It Done & Review', b: 'Pay the provider the way you agree. Afterwards, leave an honest review to help your neighbours choose.', f: 'Verified badges for checked pros', i: 'verified_user' },
              ].map((s) => (
                <View key={s.n} className="flex-1 gap-4 rounded-3xl bg-white p-7 shadow-card">
                  <View className="h-12 w-12 items-center justify-center rounded-2xl bg-secondary-fixed/60">
                    <Txt variant="headline-md" className="text-primary-dark">{s.n}</Txt>
                  </View>
                  <Txt variant="headline-md">{s.t}</Txt>
                  <Txt variant="body-lg" className="flex-1 text-on-surface-variant">{s.b}</Txt>
                  <View className="flex-row items-center gap-2 pt-4">
                    <Icon name={s.i} size={18} color={colors.primaryDark} />
                    <Txt variant="label-lg" className="text-primary-dark">{s.f}</Txt>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Stats band (live) */}
          {stats ? (
            <View className="flex-row rounded-[32px] bg-gradient-to-r from-secondary-fixed via-[#EEF5FF] to-white py-10">
              {[
                [stats.providers.toLocaleString(), 'Providers listed', 'Individuals and businesses'],
                [stats.listings.toLocaleString(), 'Services & products', 'Live public listings'],
                [stats.categories.toLocaleString(), 'Categories', 'From plumbing to poultry'],
                [stats.averageRating ? `${stats.averageRating} / 5` : '—', 'Average rating', `${stats.reviews} customer reviews`],
              ].map(([v, l, s], i) => (
                <View key={l} className={`flex-1 items-center gap-1 ${i ? 'border-l border-white/80' : ''}`}>
                  <Txt variant="display" className="text-navy">{v}</Txt>
                  <Txt variant="headline-sm" className="text-primary-dark">{l}</Txt>
                  <Txt variant="body-sm" className="text-on-surface-variant">{s}</Txt>
                </View>
              ))}
            </View>
          ) : null}

          {/* Provider CTA */}
          <View className="overflow-hidden rounded-[32px] bg-gradient-to-br from-primary-dark to-[#00897A] p-12 shadow-raised">
            <View className="absolute -right-10 -top-10 h-72 w-72 rounded-full bg-white/5" />
            <View className="absolute right-24 top-10 opacity-20">
              <Icon name="storefront" size={160} color="#FFFFFF" />
            </View>
            <View className="max-w-[620px] gap-5">
              <View className="flex-row items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1">
                <Icon name="campaign" size={15} color="#A7F3E4" />
                <Txt variant="eyebrow" className="text-[#A7F3E4]">Free for providers</Txt>
              </View>
              <Txt variant="display" className="text-white">Have a skill or something to sell?</Txt>
              <Txt variant="body-lg" className="text-white/85" style={{ fontSize: 17, lineHeight: 26 }}>
                Create a free storefront in minutes — no website or registered company needed. Show your work, set your prices and get found by people nearby.
              </Txt>
              <View className="flex-row gap-3">
                <Button title="Become a Provider" kind="white" icon="add_business" size="lg" onPress={() => router.push('/become-provider')} />
                <Button title="How it works" kind="onDark" size="lg" onPress={() => router.push('/help')} />
              </View>
            </View>
          </View>
        </View>
        <WebFooter />
      </Screen>
      <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
    </>
  );
}
