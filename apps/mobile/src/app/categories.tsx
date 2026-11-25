import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { colors, type Category } from '@vicinity/shared';
import { openCategory, TILE_TINTS, WEB_TINTS } from '@/components/CategoryGrid';
import { Screen, useWide } from '@/components/Screen';
import { Button, Chip, ErrorState, Icon, ListSkeleton, Txt } from '@/components/ui';
import { useCategories } from '@/hooks/api';

type Sort = 'all' | 'popular' | 'az';

/** Categories & Subcategories (Stitch "Vicinity - Categories & Subcategories"). */
export default function Categories() {
  const q = useCategories();
  const wide = useWide();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<Sort>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const f = filter.trim().toLowerCase();

  const list = useMemo(() => {
    const out = (q.data ?? [])
      .map((p) => ({
        ...p,
        children: (p.children ?? []).filter((c) => !f || c.name.toLowerCase().includes(f) || c.aliases?.some((a) => a.includes(f)) || p.name.toLowerCase().includes(f)),
      }))
      .filter((p) => !f || p.children.length || p.name.toLowerCase().includes(f));
    if (sort === 'popular') out.sort((a, b) => (b.listingCount ?? 0) - (a.listingCount ?? 0));
    if (sort === 'az') out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [q.data, f, sort]);

  // "Most listed" carousel: subcategories with the most live listings (real counts, no invented demand).
  const mostListed = useMemo(
    () =>
      (q.data ?? [])
        .flatMap((p) => (p.children ?? []).map((c) => ({ c, parent: p })))
        .filter((x) => (x.c.listingCount ?? 0) > 0)
        .sort((a, b) => (b.c.listingCount ?? 0) - (a.c.listingCount ?? 0))
        .slice(0, 8),
    [q.data],
  );

  const allOpen = collapsed.size === 0;
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Screen back title="Categories" subtitle="Every trade and service on Vicinity" maxWidth="max-w-5xl">
      <View className="gap-5 px-margin">
        <View className="h-14 flex-row items-center gap-3 rounded-full bg-white px-5 shadow-card">
          <Icon name="search" size={22} color={colors.onSurfaceVariant} />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Search skills, trades, or services..."
            placeholderTextColor={colors.outline}
            accessibilityLabel="Filter categories"
            className="flex-1 font-sans text-body-lg text-on-surface"
            style={{ outlineStyle: 'none' } as never}
          />
          {filter ? (
            <Pressable accessibilityLabel="Clear" onPress={() => setFilter('')}>
              <Icon name="close" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="-mx-margin flex-grow-0 px-margin">
          <Chip label="All Categories" active={sort === 'all'} onPress={() => setSort('all')} />
          <Chip label="Most listings" icon="trending_up" active={sort === 'popular'} onPress={() => setSort('popular')} />
          <Chip label="A–Z" icon="sort_by_alpha" active={sort === 'az'} onPress={() => setSort('az')} />
        </ScrollView>

        {!f && mostListed.length ? (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="h-2.5 w-2.5 rounded-full bg-primary" />
                <Txt variant="headline-sm">Most listed right now</Txt>
              </View>
              <Txt variant="label-sm" className="text-on-surface-variant">Live counts</Txt>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pb-2" className="-mx-margin flex-grow-0 px-margin">
              {mostListed.map(({ c, parent }, i) => {
                const t = TILE_TINTS[i % TILE_TINTS.length]!;
                return (
                  <Pressable key={c.id} onPress={() => openCategory(c, false)} className="w-60 gap-3 rounded-3xl bg-white p-4 shadow-card active:opacity-90">
                    <View className="flex-row items-start justify-between">
                      <View style={{ backgroundColor: t.bg }} className="h-12 w-12 items-center justify-center rounded-2xl">
                        <Icon name={parent.icon ?? 'category'} size={24} color={t.fg} />
                      </View>
                      {i < 3 ? (
                        <View className="flex-row items-center gap-1 rounded-full bg-secondary-fixed/60 px-2 py-0.5">
                          <Icon name="local_fire_department" size={13} color={colors.primaryDark} />
                          <Txt variant="label-sm" className="text-primary-dark">Top {i + 1}</Txt>
                        </View>
                      ) : null}
                    </View>
                    <View className="gap-0.5">
                      <Txt variant="headline-sm" numberOfLines={1}>{c.name}</Txt>
                      <Txt variant="body-sm" className="text-on-surface-variant" numberOfLines={1}>{parent.name}</Txt>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Txt variant="label-md" className="text-primary-dark">{c.listingCount} listing{c.listingCount === 1 ? '' : 's'}</Txt>
                      <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-container-low">
                        <Icon name="arrow_forward" size={16} color={colors.primaryDark} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View className="flex-row items-end justify-between">
          <View className="flex-1">
            <Txt variant="headline-md">Explore all categories</Txt>
            <Txt variant="body-sm" className="text-on-surface-variant">Tap any trade to browse local providers</Txt>
          </View>
          <Pressable onPress={() => setCollapsed(allOpen ? new Set(list.map((p) => p.id)) : new Set())} hitSlop={8}>
            <Txt variant="label-lg" className="text-primary-dark">{allOpen ? 'Collapse all' : 'Expand all'}</Txt>
          </Pressable>
        </View>

        {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.isSuccess && !list.length ? (
          <View className="items-center gap-2 rounded-3xl bg-white p-6 shadow-card">
            <Icon name="search_off" size={28} color={colors.onSurfaceVariant} />
            <Txt variant="body-md" className="text-center text-on-surface-variant">No category matches “{filter}”. Try a broader word, or search all listings.</Txt>
          </View>
        ) : null}

        <View className={wide ? 'flex-row flex-wrap gap-4' : 'gap-4'}>
          {list.map((p, i) => (
            <View key={p.id} className={wide ? 'w-[48.8%]' : ''}>
              <CategorySection p={p} index={i} open={!!f || !collapsed.has(p.id)} onToggle={() => toggle(p.id)} />
            </View>
          ))}
        </View>

        <View className="flex-row items-center gap-3 rounded-3xl bg-secondary-fixed/40 p-4">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-tertiary-fixed/70">
            <Icon name="verified_user" size={22} color={colors.primaryDark} />
          </View>
          <View className="flex-1">
            <Txt variant="label-lg">Look for the Verified badge</Txt>
            <Txt variant="body-sm" className="text-on-surface-variant">Verified providers have had their details reviewed by the Vicinity team. Reviews come only from real contacts and bookings.</Txt>
          </View>
        </View>

        <View className="gap-3 overflow-hidden rounded-panel bg-primary-dark p-6">
          <View className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <View className="flex-row items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1">
            <Icon name="storefront" size={14} color="#FFFFFF" />
            <Txt variant="label-sm" className="text-white">FOR PROVIDERS</Txt>
          </View>
          <Txt variant="headline-lg" className="text-white">Can’t find your service?</Txt>
          <Txt variant="body-md" className="text-white/80">Search across every listing, or list what you offer and be the first in your area.</Txt>
          <View className="flex-row flex-wrap gap-2">
            <Button title="Search everything" kind="white" icon="search" onPress={() => router.push('/search')} />
            <Button title="Offer this service" kind="onDark" iconRight="arrow_forward" onPress={() => router.push('/become-provider')} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

function CategorySection({ p, index, open, onToggle }: { p: Category & { children: Category[] }; index: number; open: boolean; onToggle: () => void }) {
  const t = WEB_TINTS[index % WEB_TINTS.length]!;
  return (
    <View className="gap-3 rounded-3xl bg-white p-4 shadow-card">
      <View className="flex-row items-center gap-3">
        <Pressable onPress={() => router.push(`/category/${p.slug}`)} accessibilityRole="link" className="flex-1 flex-row items-center gap-3">
          <View style={{ backgroundColor: t.bg }} className="h-14 w-14 items-center justify-center rounded-2xl">
            <Icon name={p.icon ?? 'category'} size={26} color={t.fg} />
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-x-2">
              <Txt variant="headline-sm" numberOfLines={1} className="flex-shrink">{p.name}</Txt>
              {p.listingCount ? (
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: t.bg }}>
                  <Txt variant="label-sm" style={{ color: t.fg }}>{p.listingCount} listed</Txt>
                </View>
              ) : null}
            </View>
            {p.description ? <Txt variant="body-sm" className="text-on-surface-variant" numberOfLines={1}>{p.description}</Txt> : null}
          </View>
        </Pressable>
        <Pressable accessibilityLabel={open ? `Collapse ${p.name}` : `Expand ${p.name}`} onPress={onToggle} className="h-9 w-9 items-center justify-center rounded-full bg-surface-container-low">
          <Icon name={open ? 'expand_less' : 'expand_more'} size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
      {open && p.children.length ? (
        <View className="flex-row flex-wrap gap-2">
          {p.children.map((c) => (
            <Pressable key={c.id} onPress={() => openCategory(c, false)} accessibilityRole="button" className="flex-row items-center gap-2 rounded-full bg-surface-container-low py-2 pl-3.5 pr-2 active:bg-secondary-fixed/60">
              <Txt variant="label-md">{c.name}</Txt>
              <View className="min-w-6 items-center rounded-full bg-white px-1.5 py-0.5">
                <Txt variant="label-sm" className="text-on-surface-variant">{c.listingCount ?? 0}</Txt>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
