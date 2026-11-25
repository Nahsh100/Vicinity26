import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, formatPrice } from '@vicinity/shared';
import { STATUS, useBookingAction, whenLabel } from '@/components/BookingCard';
import { callProvider, whatsappProvider } from '@/components/ContactActions';
import { confirmAction } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Button, ErrorState, Icon, IconButton, ListSkeleton, Notice, Sheet, Skeleton, TextField, Thumb, Txt } from '@/components/ui';
import { useBooking, useSlots } from '@/hooks/api';

const lusakaDate = (n: number) => new Date(Date.now() + 2 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

export default function BookingDetail() {
  const { id, reschedule } = useLocalSearchParams<{ id: string; reschedule?: string }>();
  const q = useBooking(id);
  const b = q.data;
  const act = useBookingAction();
  const [resOpen, setResOpen] = useState(reschedule === '1');
  const [reason, setReason] = useState<{ action: 'decline' | 'cancel'; text: string } | null>(null);

  if (q.isLoading) return <Screen back title="Booking"><View className="px-margin"><ListSkeleton rows={2} /></View></Screen>;
  if (q.isError || !b) return <Screen back title="Booking"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></Screen>;

  const s = STATUS[b.status];
  const asProvider = b.myRole === 'PROVIDER';
  const open = ['REQUESTED', 'RESCHEDULE_PROPOSED', 'CONFIRMED'].includes(b.status);
  const awaitingMe = (b.status === 'REQUESTED' && asProvider) || (b.status === 'RESCHEDULE_PROPOSED' && !b.proposedByMe);
  const other = asProvider ? { name: b.customer.name, avatar: b.customer.avatarUrl, phone: b.customer.phone, label: 'Customer' } : { name: b.provider.name, avatar: b.provider.avatarUrl, phone: b.provider.phone, label: 'Provider' };

  return (
    <Screen back title="Booking details" maxWidth="max-w-2xl">
      <View className="gap-4 px-margin">
        <View className="gap-4 overflow-hidden rounded-panel bg-white p-5 shadow-card">
          <View className={`absolute left-0 right-0 top-0 h-1.5 ${s.bar}`} />
          <View className="flex-row items-center justify-between">
            <View className={`flex-row items-center gap-1 rounded-full px-3 py-1 ${s.box}`}>
              <Icon name={s.icon} size={15} color={s.fg} />
              <Txt variant="label-md" style={{ color: s.fg }}>{s.label}</Txt>
            </View>
            <Txt variant="body-sm" className="text-on-surface-variant">Ref {b.id.slice(0, 8).toUpperCase()}</Txt>
          </View>
          <Txt variant="headline-lg">{b.listing?.title ?? 'Booking request'}</Txt>
          <View className="gap-2.5">
            <Row icon="event" label={whenLabel(b.scheduledAt)} sub={`${b.durationMinutes >= 60 ? `${b.durationMinutes / 60} h` : `${b.durationMinutes} min`} · Africa/Lusaka time`} />
            <Row icon={b.location === 'AT_CUSTOMER' ? 'home' : 'storefront'} label={b.location === 'AT_CUSTOMER' ? 'Home visit' : 'At the provider'} sub={b.location === 'AT_CUSTOMER' ? (b.address ?? '') : (b.provider.area ?? '')} />
            {b.listing ? <Row icon="sell" label={b.quotedPrice != null ? `ZMW ${b.quotedPrice} (estimated)` : formatPrice({ priceType: b.listing.priceType, price: b.listing.price, currency: b.currency })} sub="Pay the provider directly · no Vicinity fee" /> : null}
            {b.note ? <Row icon="sticky_note_2" label="Note" sub={b.note} /> : null}
            {b.statusReason ? <Row icon="info" label="Reason" sub={b.statusReason} /> : null}
          </View>
        </View>

        {b.status === 'RESCHEDULE_PROPOSED' && b.proposedScheduledAt ? (
          <Notice tone="info" icon="update" message={`${b.proposedByMe ? 'You proposed' : `${other.name} proposed`} ${whenLabel(b.proposedScheduledAt)}. ${b.proposedByMe ? 'Waiting for their answer.' : 'Accept it or keep the original time.'}`} />
        ) : null}

        <View className="flex-row items-center gap-3 rounded-3xl bg-white p-4 shadow-card">
          <Thumb uri={other.avatar} name={other.name} size={48} rounded="rounded-2xl" />
          <Pressable className="flex-1" onPress={() => !asProvider && router.push(`/provider/${b.provider.slug}`)}>
            <Txt variant="label-sm" className="font-semibold text-on-surface-variant">{other.label}</Txt>
            <Txt variant="headline-sm" numberOfLines={2}>{other.name}</Txt>
          </Pressable>
          {b.conversationId ? <IconButton icon="chat" tone="tertiary" size={40} label="Open chat" onPress={() => router.push(`/messages/${b.conversationId}`)} /> : null}
          {other.phone ? <IconButton icon="call" tone="primary" size={40} label={`Call ${other.name}`} onPress={() => callProvider(b.provider.id, other.phone!)} /> : null}
          {!asProvider && b.provider.whatsapp ? <IconButton icon="forum" tone="whatsapp" size={40} label="WhatsApp" onPress={() => whatsappProvider(b.provider.id, b.provider.whatsapp!)} /> : null}
        </View>

        <View className="gap-2">
          {awaitingMe ? (
            <View className="flex-row gap-2">
              <Button title={b.status === 'REQUESTED' ? 'Decline' : 'Keep original time'} kind="soft" className="flex-1" onPress={() => (b.status === 'REQUESTED' ? setReason({ action: 'decline', text: '' }) : act.mutate({ id: b.id, action: 'decline' }))} />
              <Button title={b.status === 'REQUESTED' ? 'Confirm booking' : 'Accept new time'} className="flex-1" loading={act.isPending} onPress={() => act.mutate({ id: b.id, action: 'accept' })} />
            </View>
          ) : null}
          {open ? (
            <View className="flex-row gap-2">
              <Button title="Propose new time" kind="soft" icon="update" className="flex-1" onPress={() => setResOpen(true)} />
              <Button title={asProvider ? 'Cancel booking' : 'Cancel request'} kind="danger" className="flex-1" onPress={() => setReason({ action: 'cancel', text: '' })} />
            </View>
          ) : null}
          {asProvider && b.status === 'CONFIRMED' && new Date(b.scheduledAt).getTime() < Date.now() ? (
            <Button title="Mark as completed" icon="task_alt" onPress={() => confirmAction('Mark as completed?', 'The customer will be asked to leave a review.', () => act.mutate({ id: b.id, action: 'complete' }), 'Complete')} />
          ) : null}
          {b.canReview ? <Button title="Leave a review" icon="rate_review" onPress={() => router.push(`/provider/${b.provider.id}/review`)} /> : null}
          {!open && !asProvider ? <Button title="Book again" kind="soft" onPress={() => router.push(`/provider/${b.provider.slug}?book=1`)} /> : null}
        </View>
      </View>

      <Sheet
        visible={!!reason}
        onClose={() => setReason(null)}
        title={reason?.action === 'decline' ? 'Decline request' : 'Cancel booking'}
        footer={
          <Button
            title={reason?.action === 'decline' ? 'Decline' : 'Cancel booking'}
            kind="danger"
            loading={act.isPending}
            onPress={() => reason && act.mutate({ id: b.id, action: reason.action, body: { reason: reason.text } }, { onSuccess: () => setReason(null) })}
          />
        }
      >
        <TextField label="Reason (optional, shared with the other side)" multiline value={reason?.text ?? ''} onChangeText={(t) => setReason((r) => (r ? { ...r, text: t } : r))} />
      </Sheet>
      {resOpen ? <RescheduleSheet bookingId={b.id} providerId={b.provider.id} listingId={b.listing?.id} onClose={() => setResOpen(false)} /> : null}
    </Screen>
  );
}

function Row({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-container-low">
        <Icon name={icon} size={18} color={colors.primaryDark} />
      </View>
      <View className="flex-1">
        <Txt variant="label-lg">{label}</Txt>
        {sub ? <Txt variant="body-sm" className="text-on-surface-variant">{sub}</Txt> : null}
      </View>
    </View>
  );
}

function RescheduleSheet({ bookingId, providerId, listingId, onClose }: { bookingId: string; providerId: string; listingId?: string; onClose: () => void }) {
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => lusakaDate(i)), []);
  const slots = useSlots(providerId, days[day]!, listingId);
  const act = useBookingAction();
  const open = slots.data?.slots.filter((s) => s.available) ?? [];
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Propose a new time"
      footer={<Button title="Send proposal" disabled={!slot} loading={act.isPending} onPress={() => slot && act.mutate({ id: bookingId, action: 'reschedule', body: { scheduledAt: slot, reason: why } }, { onSuccess: onClose })} />}
    >
      <View className="flex-row flex-wrap gap-2">
        {days.map((d, i) => (
          <Pressable key={d} onPress={() => { setDay(i); setSlot(null); }} className={`min-w-[18%] flex-1 items-center rounded-xl py-2 ${i === day ? 'bg-primary-dark' : 'bg-surface-container-low'}`}>
            <Txt variant="label-sm" className={i === day ? 'text-white' : 'text-on-surface-variant'}>{new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' })}</Txt>
            <Txt variant="headline-sm" className={i === day ? 'text-white' : 'text-on-surface'}>{Number(d.slice(8))}</Txt>
          </Pressable>
        ))}
      </View>
      {slots.isLoading ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : open.length ? (
        <View className="flex-row flex-wrap gap-2">
          {open.map((s) => (
            <Pressable key={s.start} onPress={() => setSlot(s.start)} className={`h-11 min-w-[30%] flex-1 items-center justify-center rounded-xl ${slot === s.start ? 'border-2 border-primary-dark bg-tertiary-fixed/60' : 'bg-surface-container-low'}`}>
              <Txt variant="label-lg">{new Date(s.start).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka', hour: '2-digit', minute: '2-digit' })}</Txt>
            </Pressable>
          ))}
        </View>
      ) : (
        <Txt variant="body-md" className="text-on-surface-variant">No open times on this day.</Txt>
      )}
      <TextField label="Message (optional)" value={why} onChangeText={setWhy} />
    </Sheet>
  );
}
