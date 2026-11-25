import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { bookingRequestSchema, colors, formatPrice, type Booking, type ListingSummary, type ServiceMode } from '@vicinity/shared';
import { useProviderListings, useSlots } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Button, Icon, InlineError, Segmented, Sheet, Skeleton, TextField, Txt } from './ui';

const LUSAKA_MS = 2 * 3600_000;

/** YYYY-MM-DD for "today + n days" in Africa/Lusaka. */
function lusakaDate(n: number) {
  return new Date(Date.now() + LUSAKA_MS + n * 86400_000).toISOString().slice(0, 10);
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka', hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Booking request form (Stitch web "Book Online" card): service, where, date chips, start-time grid,
 * summary and "Confirm & Request Booking". Slots come from the provider's working hours minus
 * confirmed bookings. Nothing is charged: the provider confirms, and payment is agreed directly.
 */
export function BookingPanel({
  providerId,
  providerName,
  serviceMode,
  initialListingId,
  onDone,
  compact,
}: {
  providerId: string;
  providerName: string;
  serviceMode: ServiceMode;
  initialListingId?: string | null;
  onDone?: (b: Booking) => void;
  compact?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const services = useProviderListings(providerId, 'SERVICE');
  const [listingId, setListingId] = useState<string | null>(initialListingId ?? null);
  const [location, setLocation] = useState<'AT_PROVIDER' | 'AT_CUSTOMER'>(serviceMode === 'MOBILE' ? 'AT_CUSTOMER' : 'AT_PROVIDER');
  const [dayIdx, setDayIdx] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!listingId && services.data?.length) setListingId(initialListingId ?? services.data[0]!.id);
  }, [services.data, listingId, initialListingId]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => lusakaDate(i)), []);
  const date = days[dayIdx]!;
  const slots = useSlots(providerId, date, listingId);
  const listing: ListingSummary | undefined = services.data?.find((s) => s.id === listingId);

  useEffect(() => setSlot(null), [date, listingId]);

  const m = useMutation({
    mutationFn: (body: unknown) => api.post<Booking>('/bookings', body),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      if (onDone) onDone(b);
      else router.push(`/booking/${b.id}`);
    },
  });

  const submit = () => {
    setErr(null);
    if (!user) return router.push('/login');
    if (!slot) return setErr('Choose a start time');
    const parsed = bookingRequestSchema.safeParse({ providerId, listingId, scheduledAt: slot, location, address, note });
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? 'Check the form');
    m.mutate(parsed.data);
  };

  const available = slots.data?.slots.filter((s) => s.available) ?? [];

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Txt variant="label-lg">Select service</Txt>
        {services.isLoading ? (
          <Skeleton className="h-12 w-full rounded-2xl" />
        ) : services.data?.length ? (
          <View className="gap-2">
            {services.data.map((s) => {
              const on = s.id === listingId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setListingId(s.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  className={`flex-row items-center justify-between rounded-2xl px-4 py-3 ${on ? 'bg-primary-fixed/25 border border-primary' : 'bg-surface-container-low border border-transparent'}`}
                >
                  <Txt variant="label-lg" numberOfLines={1} className="flex-1 pr-2">{s.title}</Txt>
                  <Txt variant="label-md" className="text-primary-dark">{formatPrice(s)}</Txt>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Txt variant="body-md" className="text-on-surface-variant">This provider has no bookable services yet. Send them a message instead.</Txt>
        )}
      </View>

      {serviceMode === 'BOTH' ? (
        <View className="gap-2">
          <Txt variant="label-lg">Where</Txt>
          <Segmented value={location} onChange={setLocation} options={[{ value: 'AT_PROVIDER', label: 'Visit them' }, { value: 'AT_CUSTOMER', label: 'Home call' }]} />
        </View>
      ) : null}

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Txt variant="label-lg">Select date</Txt>
          <Txt variant="label-md" className="text-on-surface-variant">{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Txt>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {days.slice(0, compact ? 4 : 8).map((d, i) => {
            const on = i === dayIdx;
            const dt = new Date(`${d}T12:00:00Z`);
            return (
              <Pressable
                key={d}
                onPress={() => setDayIdx(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className={`min-w-[22%] flex-1 items-center rounded-xl py-2 ${on ? 'bg-primary-dark' : 'bg-surface-container-low'}`}
              >
                <Txt variant="label-sm" className={on ? 'text-white' : 'text-on-surface-variant'}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-GB', { weekday: 'short' })}</Txt>
                <Txt variant="headline-sm" className={on ? 'text-white' : 'text-on-surface'}>{dt.getUTCDate()}</Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Txt variant="label-lg">Available start times</Txt>
        {slots.isLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : available.length ? (
          <View className="flex-row flex-wrap gap-2">
            {available.slice(0, compact ? 8 : 12).map((s) => {
              const on = s.start === slot;
              return (
                <Pressable
                  key={s.start}
                  onPress={() => setSlot(s.start)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className={`h-11 min-w-[46%] flex-1 items-center justify-center rounded-xl ${on ? 'border-2 border-primary-dark bg-tertiary-fixed/60' : 'bg-surface-container-low'}`}
                >
                  <Txt variant="label-lg" className={on ? 'text-primary-dark' : 'text-on-surface'}>{timeLabel(s.start)}</Txt>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View className="flex-row items-center gap-2 rounded-2xl bg-surface-container-low p-3">
            <Icon name="event_busy" size={18} color={colors.onSurfaceVariant} />
            <Txt variant="body-md" className="flex-1 text-on-surface-variant">No open times on this day. Try another date, or message {providerName}.</Txt>
          </View>
        )}
      </View>

      {location === 'AT_CUSTOMER' ? <TextField label="Your address (only shared with this provider)" value={address} onChangeText={setAddress} placeholder="e.g. Plot 482, Kalundu" /> : null}
      <TextField label="Note (optional)" value={note} onChangeText={setNote} multiline placeholder="Anything they should know?" />

      <View className="gap-2 rounded-2xl bg-surface-container-low p-4">
        <View className="flex-row justify-between">
          <Txt variant="body-md" className="text-on-surface-variant">{listing?.title ?? 'Service'}</Txt>
          <Txt variant="label-md">{listing ? formatPrice(listing) : '—'}</Txt>
        </View>
        <View className="flex-row justify-between">
          <View className="flex-row items-center gap-1">
            <Icon name="verified_user" size={15} color={colors.primaryDark} />
            <Txt variant="body-md" className="text-primary-dark">Vicinity booking fee</Txt>
          </View>
          <Txt variant="label-md" className="text-primary-dark">FREE</Txt>
        </View>
        <View className="mt-1 flex-row items-center justify-between border-t border-white pt-2">
          <Txt variant="headline-sm">Estimated total</Txt>
          <Txt variant="headline-md" className="text-primary-dark">{listing?.price != null ? `ZMW ${listing.price.toFixed(2)}` : 'On quote'}</Txt>
        </View>
        <Txt variant="body-sm" className="text-on-surface-variant">You pay the provider directly once you agree. {providerName} will confirm your time.</Txt>
      </View>

      <InlineError message={err ?? (m.error ? toApiError(m.error).message : null)} />
      <Button title={user ? 'Confirm & Request Booking' : 'Sign in to book'} kind="brand" size="lg" icon="calendar_month" loading={m.isPending} disabled={!services.data?.length} onPress={submit} />
    </View>
  );
}

export function BookingSheet(props: Omit<Parameters<typeof BookingPanel>[0], 'compact'> & { visible: boolean; onClose: () => void }) {
  const { visible, onClose, ...rest } = props;
  return (
    <Sheet visible={visible} onClose={onClose} title={`Book ${rest.providerName}`}>
      <BookingPanel {...rest} compact onDone={(b) => { onClose(); router.push(`/booking/${b.id}`); }} />
    </Sheet>
  );
}
