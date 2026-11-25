import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { AppHeader } from '@/components/AppHeader';
import { BookingCard, whenLabel } from '@/components/BookingCard';
import { HubShell } from '@/components/HubShell';
import { NearbyMap } from '@/components/NearbyMap';
import { useWide } from '@/components/Screen';
import { Button, EmptyState, ErrorState, Icon, ListSkeleton, Txt } from '@/components/ui';
import { useBookings } from '@/hooks/api';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';

/** Bookings (Stitch "My Bookings" on phones, "Bookings & Service Dashboard" on desktop). */
export default function Bookings() {
  const user = useAuth((s) => s.user);
  const wide = useWide();
  const { as } = useLocalSearchParams<{ as?: string }>();
  const [mode, setMode] = useState<'customer' | 'provider'>(as === 'provider' ? 'provider' : 'customer');
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const q = useBookings(mode, scope);
  const counts = q.data?.meta.counts;
  const items = q.data?.items ?? [];
  const location = useLocation((s) => s.location);

  if (!user) {
    return (
      <View className="flex-1 bg-surface">
        <AppHeader />
        <EmptyState icon="calendar_month" title="Your bookings live here" message="Sign in to request appointments with local providers and track them in one place." action={{ label: 'Sign in', onPress: () => router.push('/login') }} />
      </View>
    );
  }

  const modeToggle = user.providerId ? (
    <Pressable onPress={() => setMode(mode === 'customer' ? 'provider' : 'customer')} accessibilityRole="button" className="flex-row items-center gap-1.5 rounded-full bg-secondary-fixed/60 px-4 py-2">
      <Icon name="swap_horiz" size={18} color={colors.primaryDark} />
      <Txt variant="label-md" className="text-on-secondary-fixed">{mode === 'customer' ? 'Provider Mode' : 'Customer Mode'}</Txt>
    </Pressable>
  ) : null;

  const segmented = (
    <View className={`flex-row gap-1 rounded-full bg-surface-container-low p-1 ${wide ? 'self-start' : ''}`}>
      {(['upcoming', 'past'] as const).map((s) => {
        const on = scope === s;
        const n = counts?.[s];
        return (
          <Pressable key={s} onPress={() => setScope(s)} accessibilityRole="tab" accessibilityState={{ selected: on }} className={`${wide ? 'px-6' : 'flex-1'} h-11 flex-row items-center justify-center gap-2 rounded-full ${on ? 'bg-primary' : ''}`}>
            <Icon name={s === 'upcoming' ? 'event_upcoming' : 'history'} size={18} color={on ? '#FFFFFF' : colors.onSurfaceVariant} />
            <Txt variant="label-lg" className={on ? 'text-white' : 'text-on-surface-variant'}>{s === 'upcoming' ? (wide ? 'Upcoming Appointments' : 'Upcoming') : wide ? 'Past Bookings' : 'Past Bookings'}</Txt>
            {n !== undefined ? (
              <View className={`min-w-6 items-center rounded-full px-1.5 ${on ? 'bg-white/25' : 'bg-white'}`}>
                <Txt variant="label-sm" className={on ? 'text-white' : 'text-on-surface-variant'}>{n}</Txt>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const list = q.isLoading ? (
    <ListSkeleton rows={3} />
  ) : q.isError ? (
    <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  ) : items.length ? (
    <View className="gap-4">{items.map((b) => <BookingCard key={b.id} b={b} web={wide} />)}</View>
  ) : (
    <EmptyState
      icon={scope === 'upcoming' ? 'event_available' : 'history'}
      title={scope === 'upcoming' ? (mode === 'provider' ? 'No booking requests yet' : 'No upcoming bookings') : 'No past bookings'}
      message={mode === 'provider' ? 'Customers can request appointments from your services. Requests appear here and in your notifications.' : 'Find a provider and request a time that suits you.'}
      action={mode === 'customer' ? { label: 'Find a service', onPress: () => router.push('/search') } : undefined}
    />
  );

  if (wide) {
    const next = items.find((b) => b.status === 'CONFIRMED');
    return (
      <HubShell>
        <ScrollView contentContainerClassName="w-full max-w-[1180px] self-center px-10 py-8 gap-6">
          <View className="flex-row items-end justify-between gap-6">
            <View className="gap-1">
              <View className="flex-row items-center gap-1.5">
                <Icon name="verified_user" size={18} color={colors.primaryDark} />
                <Txt variant="label-lg" className="text-primary-dark">{location?.label ? `${location.label} hub` : 'Your hub'}</Txt>
              </View>
              <Txt variant="display-sm">Bookings & Service Dashboard</Txt>
              <Txt variant="body-lg" className="text-on-surface-variant">Track upcoming appointments, respond to requests and keep every conversation in one place.</Txt>
            </View>
            {user.providerId ? (
              <View className="flex-row gap-1 rounded-full bg-surface-container-low p-1">
                {(['customer', 'provider'] as const).map((m) => (
                  <Pressable key={m} onPress={() => setMode(m)} className={`h-10 justify-center rounded-full px-5 ${mode === m ? 'bg-primary' : ''}`}>
                    <Txt variant="label-lg" className={mode === m ? 'text-white' : 'text-on-surface-variant'}>{m === 'customer' ? 'Client View' : 'Provider Mode'}</Txt>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          {segmented}
          <View className="flex-row items-start gap-6">
            <View className="flex-[1.6] gap-4">
              <View className="flex-row items-center gap-2">
                <Icon name="bolt" size={22} color={colors.primaryDark} />
                <Txt variant="headline-md">{scope === 'upcoming' ? 'Active Appointments' : 'History'}</Txt>
              </View>
              {list}
            </View>
            <View className="flex-1 gap-5">
              <View className="gap-3 rounded-[28px] bg-white p-5 shadow-card">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Icon name="near_me" size={20} color={colors.primaryDark} />
                    <Txt variant="headline-sm">Next appointment</Txt>
                  </View>
                </View>
                {next ? (
                  <>
                    <NearbyMap origin={location} radiusKm={10} items={[]} height={170} />
                    <Txt variant="label-lg">{next.listing?.title ?? 'Booking'} · {whenLabel(next.scheduledAt)}</Txt>
                    <Txt variant="body-sm" className="text-on-surface-variant">{next.location === 'AT_CUSTOMER' ? next.address : `At ${next.provider.name}${next.provider.area ? `, ${next.provider.area}` : ''}`}</Txt>
                    <Button title="Open booking" kind="soft" size="sm" onPress={() => router.push(`/booking/${next.id}`)} />
                  </>
                ) : (
                  <Txt variant="body-md" className="text-on-surface-variant">No confirmed appointments yet.</Txt>
                )}
              </View>
              <View className="gap-3 rounded-[28px] bg-white p-5 shadow-card">
                <View className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-primary-soft"><Icon name="shield" size={22} color={colors.primaryDark} /></View>
                  <View>
                    <Txt variant="headline-sm">How bookings work</Txt>
                    <Txt variant="body-sm" className="text-on-surface-variant">Clear steps, no surprises</Txt>
                  </View>
                </View>
                {[
                  ['Request a time', 'Pick a service and an open slot from the provider’s working hours.'],
                  ['Provider confirms', 'They confirm, decline or propose another time — you’re notified either way.'],
                  ['Pay directly', 'Vicinity charges no booking fee. Agree the price and pay the provider.'],
                  ['Review', 'After the visit, leave a review marked “booked via Vicinity”.'],
                ].map(([t, d]) => (
                  <View key={t} className="flex-row gap-2">
                    <Icon name="check_circle" size={18} color={colors.primaryDark} />
                    <Txt variant="body-sm" className="flex-1 text-on-surface-variant"><Txt variant="label-md">{t}: </Txt>{d}</Txt>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </HubShell>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <AppHeader />
      <ScrollView contentContainerClassName="w-full max-w-2xl self-center gap-4 px-margin pb-28 pt-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Txt variant="headline-lg">Bookings & Visits</Txt>
            <Txt variant="body-md" className="text-on-surface-variant">{mode === 'customer' ? 'Track your scheduled services' : 'Requests and appointments with your customers'}</Txt>
          </View>
          {modeToggle}
        </View>
        {segmented}
        {list}
        <View className="flex-row items-center gap-3 rounded-3xl bg-gradient-to-r from-[#E3FBF4] to-[#E8F0FF] p-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-dark"><Icon name="handyman" size={22} color="#FFFFFF" /></View>
          <View className="flex-1">
            <Txt variant="headline-sm">Need a hand with something else?</Txt>
            <Txt variant="body-sm" className="text-on-surface-variant">Find local experts near {location?.label ?? 'you'}</Txt>
          </View>
          <Button title="Explore" size="sm" iconRight="arrow_forward" onPress={() => router.push('/search')} />
        </View>
        <View className="flex-row items-center justify-center gap-1.5 pt-1">
          <Icon name="shield" size={16} color={colors.onSurfaceVariant} />
          <Txt variant="label-md" className="text-on-surface-variant">No booking fees — you pay the provider directly</Txt>
        </View>
      </ScrollView>
    </View>
  );
}
