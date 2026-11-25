import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, type Category } from '@vicinity/shared';
import { useCategories, useMyGroups, useOrganizations } from '@/hooks/api';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { type SearchFilters, useSearch } from '@/store/search';
import { Button, Chip, Icon, Segmented, Sheet, TextField, Toggle, Txt } from './ui';

const SORTS: { value: NonNullable<SearchFilters['sort']>; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'distance', label: 'Nearest' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
];

/** All search filters in one sheet. Applies together; persists in the search store. */
export function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { filters, setFilters, reset } = useSearch();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const { radiusKm, setRadius, location } = useLocation();
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const [min, setMin] = useState(filters.minPrice?.toString() ?? '');
  const [max, setMax] = useState(filters.maxPrice?.toString() ?? '');
  const cats = useCategories();
  const orgs = useOrganizations({ mine: true });
  const groups = useMyGroups();
  const [openParent, setOpenParent] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(filters);
      setMin(filters.minPrice?.toString() ?? '');
      setMax(filters.maxPrice?.toString() ?? '');
    }
  }, [visible, filters]);

  const set = (p: Partial<SearchFilters>) => setDraft((d) => ({ ...d, ...p }));
  const priceError = min && max && Number(max) < Number(min) ? 'Maximum must be at least the minimum' : undefined;

  const apply = () => {
    if (priceError) return;
    const next = { ...draft, minPrice: min ? Number(min) : undefined, maxPrice: max ? Number(max) : undefined };
    useSearch.setState({ filters: next });
    onClose();
  };

  const chooseCategory = (c: Category | null, parent?: Category) => {
    if (!c) return set({ categoryId: undefined, categoryName: undefined });
    set({ categoryId: c.id, categoryName: parent ? c.name : `All ${c.name}` });
  };

  const orgGroups = (groups.data ?? []).filter((g) => g.organizationId === draft.organizationId);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      footer={
        <View className="flex-row gap-2">
          <Button
            title="Clear all"
            kind="secondary"
            className="flex-1"
            onPress={() => {
              reset();
              onClose();
            }}
          />
          <Button title="Show results" className="flex-[2]" onPress={apply} />
        </View>
      }
    >
      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Sort by</Txt>
        <View className="flex-row flex-wrap gap-2">
          {SORTS.map((s) => (
            <Chip key={s.value} label={s.label} active={(draft.sort ?? 'relevance') === s.value} onPress={() => set({ sort: s.value })} />
          ))}
        </View>
        {draft.sort === 'distance' && !location ? <Txt variant="body-sm" className="text-on-surface-variant">Set a location to sort by distance.</Txt> : null}
      </View>

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Distance</Txt>
        <View className="flex-row flex-wrap gap-2">
          {[1, 2, 5, 10, 20, 50].map((km) => (
            <Chip key={km} label={`${km} km`} active={radiusKm === km} onPress={() => setRadius(km)} />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Looking for</Txt>
        <Segmented
          value={draft.listingType ?? 'ALL'}
          onChange={(v) => set({ listingType: v === 'ALL' ? undefined : v })}
          options={[
            { value: 'ALL', label: 'Everything' },
            { value: 'SERVICE', label: 'Services', icon: 'handyman' },
            { value: 'PRODUCT', label: 'Products', icon: 'shopping_bag' },
          ]}
        />
      </View>

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Price (ZMW)</Txt>
        <View className="flex-row gap-2">
          <View className="flex-1"><TextField placeholder="Min" value={min} keyboardType="number-pad" onChangeText={(t) => setMin(t.replace(/\D/g, ''))} /></View>
          <View className="flex-1"><TextField placeholder="Max" value={max} keyboardType="number-pad" onChangeText={(t) => setMax(t.replace(/\D/g, ''))} error={priceError} /></View>
        </View>
      </View>

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Minimum rating</Txt>
        <View className="flex-row flex-wrap gap-2">
          {[undefined, 3, 4, 4.5].map((r) => (
            <Chip key={String(r)} label={r ? `${r}+ ★` : 'Any'} active={draft.minRating === r} onPress={() => set({ minRating: r })} />
          ))}
        </View>
      </View>

      <View className="gap-1">
        <Toggle label="Verified providers only" value={!!draft.verified} onChange={(v) => set({ verified: v || undefined })} />
        <Toggle label="Available now" description="Hide listings marked unavailable" value={!!draft.availableOnly} onChange={(v) => set({ availableOnly: v || undefined })} />
      </View>

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Provider type</Txt>
        <Segmented
          value={draft.providerType ?? 'ALL'}
          onChange={(v) => set({ providerType: v === 'ALL' ? undefined : v })}
          options={[
            { value: 'ALL', label: 'Any' },
            { value: 'INDIVIDUAL', label: 'Individuals' },
            { value: 'BUSINESS', label: 'Businesses' },
          ]}
        />
      </View>

      {signedIn ? (
        <View className="gap-2">
          <Txt variant="label-md" className="text-ink-muted">Search scope</Txt>
          <View className="flex-row flex-wrap gap-2">
            <Chip label="Everywhere" active={!draft.organizationId} onPress={() => set({ organizationId: undefined, organizationName: undefined, groupId: undefined, groupName: undefined })} />
            {(orgs.data ?? []).map((o) => (
              <Chip key={o.id} icon="groups" label={o.name} active={draft.organizationId === o.id} onPress={() => set({ organizationId: o.id, organizationName: o.name, groupId: undefined, groupName: undefined })} />
            ))}
          </View>
          {draft.organizationId && orgGroups.length ? (
            <View className="flex-row flex-wrap gap-2 pl-2">
              <Chip label="Whole organization" active={!draft.groupId} onPress={() => set({ groupId: undefined, groupName: undefined })} />
              {orgGroups.map((g) => (
                <Chip key={g.id} label={g.name} active={draft.groupId === g.id} onPress={() => set({ groupId: g.id, groupName: g.name })} />
              ))}
            </View>
          ) : null}
          {!orgs.data?.length ? <Txt variant="body-sm" className="text-on-surface-variant">Join an organization to search within it.</Txt> : null}
        </View>
      ) : null}

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Category</Txt>
        <Chip label="All categories" active={!draft.categoryId} onPress={() => chooseCategory(null)} />
        {(cats.data ?? []).map((p) => (
          <View key={p.id} className="rounded-2xl border border-surface-container">
            <Pressable onPress={() => setOpenParent(openParent === p.id ? null : p.id)} className="flex-row items-center gap-2 px-3 py-2.5" accessibilityRole="button">
              <Icon name={p.icon ?? 'category'} size={18} color={colors.primaryDark} />
              <Txt variant="label-lg" className="flex-1">{p.name}</Txt>
              {draft.categoryId === p.id || p.children?.some((c) => c.id === draft.categoryId) ? <Icon name="check_circle" size={16} color={colors.primary} /> : null}
              <Icon name={openParent === p.id ? 'expand_less' : 'expand_more'} size={18} color={colors.muted} />
            </Pressable>
            {openParent === p.id ? (
              <View className="flex-row flex-wrap gap-2 px-3 pb-3">
                <Chip label={`All ${p.name}`} active={draft.categoryId === p.id} onPress={() => chooseCategory(p)} />
                {p.children?.map((c) => <Chip key={c.id} label={c.name} active={draft.categoryId === c.id} onPress={() => chooseCategory(c, p)} />)}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Sheet>
  );
}
