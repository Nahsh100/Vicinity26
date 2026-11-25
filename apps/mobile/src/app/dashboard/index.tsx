import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { BarChart, StatTile } from '@/components/BarChart';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Icon, InlineError, ListSkeleton, Notice, Thumb, Txt } from '@/components/ui';
import { useAnalytics, useEnquiries, useMyProvider, useSubscription, useUnreadMessages } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { registerForPush } from '@/lib/push';
import { useAuth } from '@/store/auth';

const STATUS: Record<string, { label: string; tone: 'teal' | 'amber' | 'neutral' | 'error' }> = {
  ACTIVE: { label: 'Live', tone: 'teal' },
  DRAFT: { label: 'Not published', tone: 'amber' },
  PAUSED: { label: 'Paused', tone: 'neutral' },
  SUSPENDED: { label: 'Suspended', tone: 'error' },
};

/** Provider dashboard (Stitch web bookings dashboard layout, adapted to enquiries/contacts). */
export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const me = useMyProvider();
  const [days, setDays] = useState(30);
  const stats = useAnalytics(days);
  const enquiries = useEnquiries('NEW');
  const unread = useUnreadMessages();
  const sub = useSubscription();
  const qc = useQueryClient();
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: (pause: boolean) => api.post(pause ? '/providers/me/pause' : '/providers/me/resume'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-provider'] }),
  });

  if (!user?.providerId) {
    return (
      <Screen back title="Dashboard">
        <EmptyState icon="storefront" title="No storefront yet" message="Create a free provider profile to list services or products." action={{ label: 'Become a provider', onPress: () => router.replace('/become-provider') }} />
      </Screen>
    );
  }
  if (me.isLoading) return <Screen back title="Dashboard"><View className="px-margin"><ListSkeleton /></View></Screen>;
  if (me.isError || !me.data) return <Screen back title="Dashboard"><ErrorState error={me.error} onRetry={() => void me.refetch()} /></Screen>;

  const p = me.data;
  const t = stats.data?.totals;
  const s = STATUS[p.status]!;

  return (
    <Screen back title="Dashboard" refreshing={stats.isRefetching} onRefresh={() => { void me.refetch(); void stats.refetch(); void enquiries.refetch(); }}>
      <View className="gap-4 px-margin">
        <Card className="flex-row items-center gap-3 p-4">
          <Thumb uri={p.logoUrl} name={p.displayName} size={56} rounded="rounded-full" />
          <View className="flex-1 gap-1">
            <Txt variant="headline-sm">{p.displayName}</Txt>
            <View className="flex-row flex-wrap gap-1.5">
              <Badge label={s.label} tone={s.tone} />
              <Badge label={p.verificationStatus === 'VERIFIED' ? 'Verified' : p.verificationStatus === 'PENDING' ? 'Verification pending' : 'Not verified'} tone={p.verificationStatus === 'VERIFIED' ? 'teal' : 'neutral'} icon="verified" />
              <Badge label={`${sub.data?.plan.name ?? 'Free'} plan`} tone="navy" />
            </View>
          </View>
          <Button title="View" size="sm" kind="secondary" onPress={() => router.push(`/provider/${p.slug}`)} />
        </Card>

        {p.status === 'DRAFT' ? <Card className="flex-row items-center gap-3 bg-amber-soft" onPress={() => router.push('/become-provider')}><Icon name="rocket_launch" size={22} color="#92400E" /><Txt variant="body-md" className="flex-1">Finish setting up and publish to appear in search.</Txt><Icon name="chevron_right" size={20} color="#92400E" /></Card> : null}
        {p.status === 'SUSPENDED' ? <Notice tone="warning" icon="block" message="Your profile is suspended and hidden from customers. Contact support for details." /> : null}

        <View className="flex-row flex-wrap gap-2">
          <QuickLink icon="event_available" label="Bookings" sub="Requests & schedule" href="/bookings?as=provider" />
          <QuickLink icon="chat" label="Messages" sub={unread.data?.count ? `${unread.data.count} unread` : 'All caught up'} href="/messages" highlight={!!unread.data?.count} />
          <QuickLink icon="sell" label="Listings" sub={`${p.counts.listings}`} href="/dashboard/listings" />
          <QuickLink icon="forum" label="Enquiries" sub={enquiries.data?.length ? `${enquiries.data.length} new` : 'None new'} href="/dashboard/enquiries" highlight={!!enquiries.data?.length} />
          <QuickLink icon="photo_library" label="Portfolio" sub={`${p.counts.portfolio} projects`} href="/dashboard/portfolio" />
          <QuickLink icon="rate_review" label="Reviews" sub={`${p.ratingCount} · ${p.ratingAverage.toFixed(1)}★`} href="/dashboard/reviews" />
          <QuickLink icon="edit" label="Edit profile" sub="Details, hours, places" href="/dashboard/profile" />
          <QuickLink icon="workspace_premium" label="Plan & billing" sub={sub.data?.pendingPayment ? "Payment waiting" : `${sub.data?.plan.name ?? "Free"} plan`} href="/dashboard/plan" highlight={!!sub.data?.pendingPayment} />
        </View>

        <View className="flex-row items-center justify-between">
          <Txt variant="headline-md">Performance</Txt>
          <View className="flex-row gap-1.5">
            {[7, 30, 90].map((d) => <Chip key={d} label={`${d} days`} active={days === d} onPress={() => setDays(d)} />)}
          </View>
        </View>
        {stats.isError ? <ErrorState error={stats.error} onRetry={() => void stats.refetch()} /> : null}
        <View className="flex-row flex-wrap gap-2">
          <StatTile label="Profile views" value={t?.profileViews ?? '–'} icon={<Icon name="visibility" size={16} color={colors.primaryDark} />} />
          <StatTile label="Search appearances" value={t?.searchAppearances ?? '–'} icon={<Icon name="search" size={16} color={colors.primaryDark} />} />
          <StatTile label="Calls" value={t?.phoneClicks ?? '–'} icon={<Icon name="call" size={16} color={colors.primaryDark} />} />
          <StatTile label="WhatsApp taps" value={t?.whatsappClicks ?? '–'} icon={<Icon name="chat" size={16} color={colors.whatsappDark} />} />
          <StatTile label="Enquiries" value={t?.enquiries ?? '–'} icon={<Icon name="forum" size={16} color={colors.primaryDark} />} />
          <StatTile label="Saved by customers" value={t?.favorites ?? '–'} icon={<Icon name="favorite" size={16} color={colors.danger} />} />
        </View>
        {stats.data ? (
          <>
            <BarChart title="Profile & listing views" data={stats.data.daily.map((d) => ({ date: d.date, value: d.profileViews + d.listingViews }))} total={t!.profileViews + t!.listingViews + 0} />
            <BarChart title="Contact taps (call, WhatsApp, email)" data={stats.data.daily.map((d) => ({ date: d.date, value: d.contactClicks }))} total={stats.data.daily.reduce((a, d) => a + d.contactClicks, 0)} />
          </>
        ) : null}

        <Card className="gap-2">
          <Txt variant="headline-sm">Account</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">
            {sub.data?.plan.code === 'FREE' || !sub.data
              ? `Free plan: up to ${sub.data?.entitlements.maxListings ?? 10} listings and ${sub.data?.entitlements.maxGalleryMedia ?? 24} gallery items.`
              : `${sub.data.plan.name} plan until ${sub.data.currentPeriodEnd?.slice(0, 10)}.`}
          </Txt>
          <Button title={sub.data?.plan.code === 'FREE' || !sub.data ? 'See plans' : 'Manage plan'} icon="workspace_premium" kind="soft" size="sm" onPress={() => router.push('/dashboard/plan')} />
          {p.status === 'ACTIVE' || p.status === 'PAUSED' ? (
            <Button
              title={p.status === 'ACTIVE' ? 'Pause my storefront' : 'Resume my storefront'}
              kind={p.status === 'ACTIVE' ? 'outline' : 'primary'}
              size="sm"
              loading={toggle.isPending}
              onPress={() => toggle.mutate(p.status === 'ACTIVE')}
            />
          ) : null}
          <InlineError message={toggle.error ? toApiError(toggle.error).message : null} />
          <Button
            title="Get enquiry alerts on this phone"
            icon="notifications_active"
            kind="ghost"
            size="sm"
            onPress={() => void registerForPush().then((r) => setPushMsg(r.ok ? 'Push notifications are on for this device.' : r.reason))}
          />
          {pushMsg ? <Txt variant="body-sm" className="text-on-surface-variant">{pushMsg}</Txt> : null}
        </Card>
      </View>
    </Screen>
  );
}

function QuickLink({ icon, label, sub, href, highlight }: { icon: string; label: string; sub: string; href: Href; highlight?: boolean }) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" className={`min-w-[46%] flex-1 flex-row items-center gap-2 rounded-card p-3 shadow-card ${highlight ? 'bg-primary-soft' : 'bg-white'}`}>
      <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-low"><Icon name={icon} size={18} color={colors.primaryDark} /></View>
      <View className="flex-1">
        <Txt variant="label-lg">{label}</Txt>
        <Txt variant="body-sm" className="text-on-surface-variant">{sub}</Txt>
      </View>
    </Pressable>
  );
}
