import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import type { z } from 'zod';
import { colors, formatPrice, listingSchema, StockStatus, type ListingDetail, type MediaRef, type PriceType } from '@vicinity/shared';
import { useCategories, useMyGroups, useOrganizations } from '@/hooks/api';
import { MediaPicker } from './MediaPicker';
import { Button, Chip, FormField, Icon, InlineError, Segmented, Sheet, TextField, Toggle, Txt } from './ui';

type Form = z.input<typeof listingSchema>;

const PRICE_TYPES: { value: PriceType; label: string }[] = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'STARTING_FROM', label: 'Starting from' },
  { value: 'RANGE', label: 'Range' },
  { value: 'HOURLY', label: 'Per hour' },
  { value: 'PER_UNIT', label: 'Per unit' },
  { value: 'NEGOTIABLE', label: 'Negotiable' },
  { value: 'QUOTE', label: 'Request a quote' },
];

export function listingToForm(l: ListingDetail): Form {
  return {
    type: l.type,
    title: l.title,
    description: l.description ?? '',
    categoryId: l.category.id,
    priceType: l.priceType,
    price: l.price,
    priceMax: l.priceMax,
    currency: l.currency,
    unit: l.unit ?? '',
    keywords: l.keywords,
    visibility: l.visibility,
    organizationId: l.organization?.id ?? null,
    groupId: l.group?.id ?? null,
    isAvailable: l.isAvailable,
    durationMinutes: l.durationMinutes,
    stockStatus: (l.stockStatus as (typeof StockStatus)[number] | null) ?? null,
    pickupAvailable: l.pickupAvailable ?? true,
    deliveryAvailable: l.deliveryAvailable ?? false,
    deliveryRadiusKm: l.deliveryRadiusKm,
    mediaIds: l.media.map((m) => m.id),
  };
}

/** Create/edit a service or product. Validation is the shared zod schema the API also enforces. */
export function ListingForm({
  initial,
  initialMedia = [],
  submitLabel,
  onSubmit,
  lockType,
}: {
  initial?: Partial<Form>;
  initialMedia?: MediaRef[];
  submitLabel: string;
  onSubmit: (v: z.output<typeof listingSchema>) => Promise<void>;
  lockType?: boolean;
}) {
  const cats = useCategories();
  const orgs = useOrganizations({ mine: true });
  const groups = useMyGroups();
  const [media, setMedia] = useState<MediaRef[]>(initialMedia);
  const [catOpen, setCatOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, setValue, formState } = useForm<Form>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      type: 'SERVICE',
      title: '',
      description: '',
      priceType: 'FIXED',
      price: null,
      priceMax: null,
      currency: 'ZMW',
      unit: '',
      keywords: [],
      visibility: 'PUBLIC',
      organizationId: null,
      groupId: null,
      isAvailable: true,
      pickupAvailable: true,
      deliveryAvailable: false,
      mediaIds: [],
      ...initial,
    } as Form,
  });
  const v = useWatch({ control });
  const allCats = (cats.data ?? []).flatMap((p) => [p, ...(p.children ?? [])]);
  const catName = allCats.find((c) => c.id === v.categoryId)?.name;
  const orgGroups = (groups.data ?? []).filter((g) => g.organizationId === v.organizationId);

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await onSubmit(listingSchema.parse({ ...values, mediaIds: media.map((m) => m.id) }));
    } catch (e) {
      setError((e as Error).message);
    }
  });

  const needsPrice = v.priceType && !['QUOTE'].includes(v.priceType);
  const preview = v.priceType ? formatPrice({ priceType: v.priceType, price: v.price ?? null, priceMax: v.priceMax ?? null, currency: 'ZMW', unit: v.unit }) : '';

  return (
    <View className="gap-4">
      {!lockType ? (
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Segmented
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'SERVICE', label: 'Service', icon: 'handyman' },
                { value: 'PRODUCT', label: 'Product', icon: 'shopping_bag' },
              ]}
            />
          )}
        />
      ) : null}
      <FormField control={control} name="title" label={v.type === 'PRODUCT' ? 'Product name' : 'Service title'} placeholder={v.type === 'PRODUCT' ? 'e.g. Fresh beef (mixed cuts)' : 'e.g. Gel manicure'} />

      <View className="gap-1.5">
        <Txt variant="label-md" className="text-ink-muted">Category</Txt>
        <Pressable onPress={() => setCatOpen(true)} accessibilityRole="button" accessibilityLabel={`Category: ${catName ?? 'not chosen'}`} className={`h-12 flex-row items-center justify-between rounded-2xl border bg-white px-4 ${formState.errors.categoryId ? 'border-error' : 'border-surface-container'}`}>
          <Txt variant="body-lg" className={catName ? 'text-ink' : 'text-placeholder'}>{catName ?? 'Choose a category'}</Txt>
          <Icon name="expand_more" size={20} color={colors.muted} />
        </Pressable>
        {formState.errors.categoryId ? <Txt variant="body-sm" className="text-error">{formState.errors.categoryId.message}</Txt> : null}
      </View>

      <FormField control={control} name="description" label="Description" multiline placeholder="What's included, how long it takes, what makes you different" />

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Pricing</Txt>
        <View className="flex-row flex-wrap gap-2">
          {PRICE_TYPES.map((p) => <Chip key={p.value} label={p.label} active={v.priceType === p.value} onPress={() => setValue('priceType', p.value, { shouldValidate: formState.isSubmitted })} />)}
        </View>
        {needsPrice ? (
          <View className="flex-row gap-2">
            <View className="flex-1"><FormField control={control} name="price" label={v.priceType === 'RANGE' ? 'Min (ZMW)' : 'Price (ZMW)'} numeric /></View>
            {v.priceType === 'RANGE' ? <View className="flex-1"><FormField control={control} name="priceMax" label="Max (ZMW)" numeric /></View> : null}
            {v.priceType === 'PER_UNIT' ? <View className="flex-1"><FormField control={control} name="unit" label="Unit" placeholder="kg, bag, load" /></View> : null}
          </View>
        ) : null}
        {preview ? <Txt variant="body-sm" className="text-primary-dark">Shown as: {preview}</Txt> : null}
      </View>

      {v.type === 'SERVICE' ? (
        <FormField control={control} name="durationMinutes" label="Typical duration in minutes (optional)" numeric />
      ) : (
        <View className="gap-2">
          <Txt variant="label-md" className="text-ink-muted">Stock</Txt>
          <View className="flex-row flex-wrap gap-2">
            {StockStatus.map((s) => <Chip key={s} label={s.replace(/_/g, ' ').toLowerCase()} active={(v.stockStatus ?? 'IN_STOCK') === s} onPress={() => setValue('stockStatus', s)} />)}
          </View>
          <Controller control={control} name="pickupAvailable" render={({ field }) => <Toggle label="Pickup available" value={!!field.value} onChange={field.onChange} />} />
          <Controller control={control} name="deliveryAvailable" render={({ field }) => <Toggle label="I deliver" value={!!field.value} onChange={field.onChange} />} />
          {v.deliveryAvailable ? <FormField control={control} name="deliveryRadiusKm" label="Delivery distance (km)" numeric /> : null}
        </View>
      )}

      <MediaPicker label="Photos & short videos" value={media} onChange={setMedia} purpose="LISTING" allowVideo max={12} />

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Search keywords</Txt>
        <View className="flex-row flex-wrap gap-2">
          {(v.keywords ?? []).map((k) => (
            <Chip key={k} label={k} active onClear={() => setValue('keywords', (v.keywords ?? []).filter((x) => x !== k))} />
          ))}
        </View>
        <TextField
          placeholder="Add a word people might search for, then press enter"
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={() => {
            const k = keyword.trim().toLowerCase();
            if (k && !(v.keywords ?? []).includes(k) && (v.keywords ?? []).length < 20) setValue('keywords', [...(v.keywords ?? []), k]);
            setKeyword('');
          }}
        />
      </View>

      <Controller control={control} name="isAvailable" render={({ field }) => <Toggle label="Available now" description="Turn off when you're fully booked or out of stock" value={!!field.value} onChange={field.onChange} />} />

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Who can see this?</Txt>
        <View className="flex-row flex-wrap gap-2">
          <Chip label="Everyone" icon="public" active={v.visibility === 'PUBLIC'} onPress={() => { setValue('visibility', 'PUBLIC'); setValue('groupId', null); }} />
          {(orgs.data ?? []).map((o) => (
            <Chip key={o.id} icon="groups" label={`${o.name} members`} active={v.visibility !== 'PUBLIC' && v.organizationId === o.id && !v.groupId} onPress={() => { setValue('visibility', 'ORGANIZATION'); setValue('organizationId', o.id); setValue('groupId', null); }} />
          ))}
        </View>
        {v.organizationId && v.visibility !== 'PUBLIC' && orgGroups.length ? (
          <View className="flex-row flex-wrap gap-2 pl-2">
            {orgGroups.map((g) => (
              <Chip key={g.id} icon="lock" label={`${g.name} only`} active={v.groupId === g.id} onPress={() => { setValue('visibility', 'GROUP'); setValue('groupId', g.id); }} />
            ))}
          </View>
        ) : null}
        <Txt variant="body-sm" className="text-on-surface-variant">
          {v.visibility === 'PUBLIC' ? 'Anyone on Vicinity can find this.' : v.visibility === 'GROUP' ? 'Only members of the selected group can find this.' : 'Only members of the selected organization can find this.'}
        </Txt>
        {formState.errors.organizationId || formState.errors.groupId ? <Txt variant="body-sm" className="text-error">{formState.errors.organizationId?.message ?? formState.errors.groupId?.message}</Txt> : null}
      </View>

      <InlineError message={error} />
      <Button title={submitLabel} loading={formState.isSubmitting} onPress={() => void submit()} />

      <Sheet visible={catOpen} onClose={() => setCatOpen(false)} title="Choose a category">
        {(cats.data ?? []).map((p) => (
          <View key={p.id} className="gap-2">
            <Txt variant="label-lg">{p.name}</Txt>
            <View className="flex-row flex-wrap gap-2">
              {(p.children ?? []).map((c) => (
                <Chip key={c.id} label={c.name} active={v.categoryId === c.id} onPress={() => { setValue('categoryId', c.id, { shouldValidate: true }); setCatOpen(false); }} />
              ))}
            </View>
          </View>
        ))}
      </Sheet>
    </View>
  );
}
