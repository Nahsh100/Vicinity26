import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { Category } from '@vicinity/shared';
import { useSearch } from '@/store/search';
import { Icon, Skeleton, Txt } from './ui';

/** Short labels matching the Stitch home grid. */
const SHORT: Record<string, string> = {
  'Professional Services': 'Professional',
  'Transport and Delivery': 'Transport',
  'Events and Entertainment': 'Events',
  'Repairs and Maintenance': 'Repairs',
  'Food and Catering': 'Food & Catering',
  'Health and Wellness': 'Health & Wellness',
  'Construction and Skilled Labour': 'Construction',
  'Child and Family Services': 'Family Care',
  'Education and Training': 'Education',
  'Sales and Supply': 'Sales & Supply',
  'Farming and Agriculture': 'Farming',
  'Fashion and Clothing': 'Fashion',
  'Tech and Digital Services': 'Tech & Digital',
  'Pets and Animals': 'Pets',
  'Cleaning and Sanitation': 'Cleaning',
};

export const shortName = (name: string) => SHORT[name] ?? name;

/** Exact tile tints from the Stitch home grid (background, icon colour), in grid order. */
export const TILE_TINTS = [
  { bg: 'rgba(101,251,207,0.30)', fg: '#006B54' }, // tertiary-fixed/30
  { bg: 'rgba(208,228,255,0.55)', fg: '#006B5F' }, // secondary-fixed/40
  { bg: '#D3E4FE', fg: '#4D6077' }, // surface-container-highest
  { bg: 'rgba(255,218,214,0.55)', fg: '#93000A' }, // error-container/40
  { bg: '#DCE9FF', fg: '#071D30' }, // surface-container-high
  { bg: 'rgba(121,247,227,0.40)', fg: '#006B5F' }, // primary-fixed/40
  { bg: '#D3E4FE', fg: '#35485E' }, // surface-variant
  { bg: 'rgba(205,226,252,0.75)', fg: '#006B5F' }, // secondary-container/60
] as const;

/** Web category card tints (Stitch "Explore Lusaka Services by Category"). */
export const WEB_TINTS = [
  { bg: '#E3F8F1', fg: '#0F766E' },
  { bg: '#FEF3C7', fg: '#B45309' },
  { bg: '#EDE9FE', fg: '#6D28D9' },
  { bg: '#FEE2E2', fg: '#B91C1C' },
  { bg: '#E0F2FE', fg: '#0369A1' },
  { bg: '#DCFCE7', fg: '#15803D' },
  { bg: '#FCE7F3', fg: '#BE185D' },
  { bg: '#F1F5F9', fg: '#334155' },
] as const;

export function openCategory(c: { id: string; name: string; slug: string }, isParent: boolean) {
  if (isParent) {
    router.push(`/category/${c.slug}`);
    return;
  }
  useSearch.setState((s) => ({ query: '', filters: { ...s.filters, categoryId: c.id, categoryName: c.name } }));
  router.push('/search');
}

export function CategoryTile({ c, index, onPress }: { c: Pick<Category, 'name' | 'icon'>; index: number; onPress: () => void }) {
  const t = TILE_TINTS[index % TILE_TINTS.length]!;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={c.name} onPress={onPress} className="flex-1 items-center active:scale-95">
      <View style={{ backgroundColor: t.bg }} className="h-14 w-14 items-center justify-center rounded-2xl shadow-soft">
        <Icon name={c.icon ?? 'category'} size={28} color={t.fg} />
      </View>
      <Txt variant="label-md" numberOfLines={2} className="mt-1.5 text-center" style={{ lineHeight: 15 }}>
        {shortName(c.name)}
      </Txt>
    </Pressable>
  );
}

/** Mobile 4-column grid: first seven categories plus "All" (Stitch shows an 8-item balanced matrix). */
export function CategoryGrid({ categories, loading }: { categories?: Category[]; loading?: boolean }) {
  if (loading || !categories) {
    return (
      <View className="flex-row flex-wrap gap-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={{ width: '25%' }} className="items-center gap-2">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <Skeleton className="h-3 w-12" />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap gap-y-4">
      {categories.slice(0, 7).map((c, i) => (
        <View key={c.id} style={{ width: '25%' }}>
          <CategoryTile c={c} index={i} onPress={() => openCategory(c, true)} />
        </View>
      ))}
      <View style={{ width: '25%' }}>
        <CategoryTile c={{ name: 'All', icon: 'apps' }} index={7} onPress={() => router.push('/categories')} />
      </View>
    </View>
  );
}

/** Desktop row of category cards with live listing counts. */
export function CategoryCards({ categories }: { categories?: Category[] }) {
  return (
    <View className="flex-row flex-wrap gap-4">
      {(categories ?? []).slice(0, 8).map((c, i) => {
        const t = WEB_TINTS[i % WEB_TINTS.length]!;
        return (
          <Pressable
            key={c.id}
            onPress={() => openCategory(c, true)}
            accessibilityRole="button"
            style={{ flexBasis: '11%' }}
            className="min-w-[130px] flex-1 items-center gap-3 rounded-3xl bg-white px-3 py-6 shadow-card active:opacity-90"
          >
            <View style={{ backgroundColor: t.bg }} className="h-14 w-14 items-center justify-center rounded-2xl">
              <Icon name={c.icon ?? 'category'} size={28} color={t.fg} />
            </View>
            <View className="items-center">
              <Txt variant="label-lg" numberOfLines={1}>{shortName(c.name)}</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">{c.listingCount ?? 0} listing{c.listingCount === 1 ? '' : 's'}</Txt>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
