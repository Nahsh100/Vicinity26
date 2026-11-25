import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors, type Booking, type BookingStatus } from '@vicinity/shared';
import { api, toApiError } from '@/lib/api';
import { callProvider } from './ContactActions';
import { confirmAction, notify } from './ReviewCard';
import { Button, Icon, IconButton, Thumb, Txt } from './ui';

export const STATUS: Record<BookingStatus, { label: string; icon: string; box: string; fg: string; bar: string }> = {
  REQUESTED: { label: 'Pending Confirmation', icon: 'hourglass_top', box: 'bg-amber-soft', fg: '#92400E', bar: 'bg-amber' },
  RESCHEDULE_PROPOSED: { label: 'New Time Proposed', icon: 'update', box: 'bg-secondary-fixed/70', fg: '#35485E', bar: 'bg-secondary' },
  CONFIRMED: { label: 'Confirmed', icon: 'check_circle', box: 'bg-tertiary-fixed/40', fg: '#006B54', bar: 'bg-primary' },
  COMPLETED: { label: 'Completed', icon: 'task_alt', box: 'bg-surface-container', fg: '#3C4946', bar: 'bg-outline-variant' },
  DECLINED: { label: 'Declined', icon: 'block', box: 'bg-error-container/60', fg: '#93000A', bar: 'bg-error' },
  CANCELLED: { label: 'Cancelled', icon: 'cancel', box: 'bg-surface-container', fg: '#3C4946', bar: 'bg-outline-variant' },
};

/** "Today, 2:30 PM" / "Tomorrow, 10:00 AM" / "Wed 20 Nov, 09:00 AM" in Africa/Lusaka. */
export function whenLabel(iso: string) {
  const fmtDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });
  const d = new Date(iso);
  const today = fmtDay(new Date());
  const tomorrow = fmtDay(new Date(Date.now() + 86400_000));
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
  const day = fmtDay(d) === today ? 'Today' : fmtDay(d) === tomorrow ? 'Tomorrow' : d.toLocaleDateString('en-GB', { timeZone: 'Africa/Lusaka', weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

export function useBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: 'accept' | 'decline' | 'cancel' | 'complete' | 'reschedule'; body?: object }) => api.post<Booking>(`/bookings/${id}/${action}`, body ?? {}),
    onSuccess: (b) => {
      qc.setQueryData(['booking', b.id], b);
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => notify('Could not update the booking', toApiError(e).message),
  });
}

/** Booking card (Stitch "My Bookings"): accent bar, time + status pills, party, price, place, actions. */
export function BookingCard({ b, web }: { b: Booking; web?: boolean }) {
  const s = STATUS[b.status];
  const act = useBookingAction();
  const asProvider = b.myRole === 'PROVIDER';
  const party = asProvider ? { name: b.customer.name, avatar: b.customer.avatarUrl, sub: 'Customer' } : { name: b.provider.name, avatar: b.provider.avatarUrl, sub: b.provider.area ?? '' };
  const title = b.listing?.title ?? 'Booking request';
  const awaitingMe = (b.status === 'REQUESTED' && asProvider) || (b.status === 'RESCHEDULE_PROPOSED' && !b.proposedByMe);

  return (
    <Pressable onPress={() => router.push(`/booking/${b.id}`)} className={`overflow-hidden rounded-3xl bg-white shadow-card active:opacity-95 ${web ? 'p-6' : 'p-4'}`}>
      <View className={`absolute bottom-0 left-0 top-0 w-1.5 ${s.bar}`} />
      <View className="gap-3 pl-1">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-1 rounded-full bg-secondary-fixed/60 px-2.5 py-1">
            <Icon name={b.status === 'CONFIRMED' ? 'bolt' : 'calendar_month'} size={14} color={colors.primaryDark} />
            <Txt variant="label-sm" className="text-on-secondary-fixed">{whenLabel(b.status === 'RESCHEDULE_PROPOSED' && b.proposedScheduledAt ? b.proposedScheduledAt : b.scheduledAt)}</Txt>
          </View>
          <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${s.box}`}>
            <Icon name={s.icon} size={14} color={s.fg} />
            <Txt variant="label-sm" style={{ color: s.fg }}>{s.label}</Txt>
          </View>
        </View>

        <View className="flex-row items-center gap-3">
          <View>
            <Thumb uri={party.avatar} name={party.name} size={web ? 64 : 56} rounded="rounded-xl" />
            {!asProvider && b.provider.verified ? (
              <View className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary">
                <Icon name="verified" size={12} color="#FFFFFF" fill />
              </View>
            ) : null}
          </View>
          <View className="min-w-0 flex-1">
            <Txt variant="headline-sm" numberOfLines={1} style={{ fontSize: web ? 18 : 17 }}>{title}</Txt>
            <View className="flex-row items-center gap-1.5">
              <Txt variant="label-md" className="text-on-surface-variant" numberOfLines={1}>{party.name}</Txt>
              {!asProvider && b.provider.ratingCount ? (
                <View className="flex-row items-center gap-0.5">
                  <Icon name="star" size={13} color={colors.amber} />
                  <Txt variant="label-sm" className="text-amber-dark">{b.provider.ratingAverage.toFixed(1)}</Txt>
                </View>
              ) : null}
            </View>
            {b.quotedPrice != null ? (
              <Txt variant="label-md" className="text-primary-dark">
                ZMW {b.quotedPrice} <Txt variant="body-sm" className="text-on-surface-variant">(estimated)</Txt>
              </Txt>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-2.5 rounded-2xl bg-surface-container-low px-3 py-2.5">
          <Icon name={b.location === 'AT_CUSTOMER' ? 'location_on' : 'storefront'} size={18} color={colors.primaryDark} />
          <View className="flex-1">
            <Txt variant="label-sm" className="font-semibold text-on-surface-variant">{b.location === 'AT_CUSTOMER' ? 'Service location' : 'At the provider'}</Txt>
            <Txt variant="body-sm" numberOfLines={1}>{b.location === 'AT_CUSTOMER' ? (b.address ?? 'Customer address') : (b.provider.area ?? 'Provider location')}</Txt>
          </View>
          <Icon name="chevron_right" size={18} color={colors.outline} />
        </View>

        {b.status === 'RESCHEDULE_PROPOSED' && b.proposedScheduledAt ? (
          <Txt variant="body-sm" className="text-secondary">
            {b.proposedByMe ? 'You proposed' : 'They proposed'} {whenLabel(b.proposedScheduledAt)} instead of {whenLabel(b.scheduledAt)}.
          </Txt>
        ) : null}

        <View className="flex-row items-center gap-2">
          {awaitingMe ? (
            <>
              <Button title={b.status === 'REQUESTED' ? 'Decline' : 'Keep old time'} kind="soft" className="flex-1" onPress={() => act.mutate({ id: b.id, action: 'decline' })} />
              <Button title={b.status === 'REQUESTED' ? 'Confirm' : 'Accept new time'} className="flex-1" loading={act.isPending} onPress={() => act.mutate({ id: b.id, action: 'accept' })} />
            </>
          ) : b.status === 'REQUESTED' || b.status === 'RESCHEDULE_PROPOSED' ? (
            <>
              <Button title="Reschedule" kind="soft" className="flex-1" onPress={() => router.push(`/booking/${b.id}?reschedule=1`)} />
              <Button title="Cancel Request" kind="danger" className="flex-1" onPress={() => confirmAction('Cancel this booking?', `${title} · ${whenLabel(b.scheduledAt)}`, () => act.mutate({ id: b.id, action: 'cancel' }), 'Cancel booking')} />
            </>
          ) : b.status === 'CONFIRMED' ? (
            <>
              <Button title="Message" icon="chat" kind="soft" className="flex-1" onPress={() => b.conversationId && router.push(`/messages/${b.conversationId}`)} />
              {asProvider && new Date(b.scheduledAt).getTime() < Date.now() ? (
                <Button title="Mark done" icon="task_alt" className="flex-1" onPress={() => act.mutate({ id: b.id, action: 'complete' })} />
              ) : (
                <Button title="Details" icon="near_me" className="flex-1" onPress={() => router.push(`/booking/${b.id}`)} />
              )}
              {!asProvider && b.provider.phone ? <IconButton icon="call" tone="primary" size={44} label="Call" onPress={() => callProvider(b.provider.id, b.provider.phone!)} /> : null}
              {asProvider && b.customer.phone ? <IconButton icon="call" tone="primary" size={44} label="Call customer" onPress={() => callProvider(b.provider.id, b.customer.phone!)} /> : null}
            </>
          ) : b.canReview ? (
            <Button title="Leave a Review" icon="rate_review" kind="tonal" className="flex-1" onPress={() => router.push(`/provider/${b.provider.id}/review`)} />
          ) : (
            <Button title="Book again" kind="soft" className="flex-1" onPress={() => router.push(`/provider/${b.provider.slug}?book=1`)} />
          )}
        </View>
      </View>
    </Pressable>
  );
}
