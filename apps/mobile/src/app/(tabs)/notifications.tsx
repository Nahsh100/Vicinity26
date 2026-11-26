import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { colors, timeAgo, type AppNotification, type NotificationCategory } from '@vicinity/shared';
import { AppHeader } from '@/components/AppHeader';
import { useWide } from '@/components/Screen';
import { Button, Chip, EmptyState, ErrorState, Icon, ListSkeleton, Txt } from '@/components/ui';
import { useNotifications } from '@/hooks/api';
import { api } from '@/lib/api';
import { notificationTarget } from '@/lib/notificationRoutes';
import { useAuth } from '@/store/auth';

const STYLE: Record<NotificationCategory, { icon: string; bg: string; fg: string }> = {
  BOOKING: { icon: 'event_available', bg: 'bg-tertiary-fixed/30', fg: colors.tertiary },
  MESSAGE: { icon: 'chat', bg: 'bg-secondary-fixed/60', fg: colors.primaryDark },
  ENQUIRY: { icon: 'forum', bg: 'bg-primary-fixed/30', fg: colors.primaryDark },
  REVIEW: { icon: 'star', bg: 'bg-secondary-fixed/60', fg: colors.navy },
  SAVED_PROVIDER: { icon: 'favorite', bg: 'bg-error-container/50', fg: '#93000A' },
  ORGANIZATION: { icon: 'groups', bg: 'bg-surface-container-high', fg: colors.navy },
  DISCOVERY: { icon: 'location_searching', bg: 'bg-tertiary-fixed/30', fg: colors.tertiary },
  PROMOTION: { icon: 'sell', bg: 'bg-secondary-fixed/60', fg: colors.secondary },
  ACCOUNT: { icon: 'shield', bg: 'bg-surface-container-high', fg: colors.secondary },
  SYSTEM: { icon: 'info', bg: 'bg-surface-container-high', fg: colors.secondary },
};

const FILTERS: { key: 'ALL' | NotificationCategory; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'BOOKING', label: 'Bookings' },
  { key: 'MESSAGE', label: 'Messages' },
  { key: 'ENQUIRY', label: 'Enquiries' },
  { key: 'REVIEW', label: 'Reviews' },
  { key: 'SAVED_PROVIDER', label: 'Saved' },
  { key: 'ORGANIZATION', label: 'Groups' },
  { key: 'ACCOUNT', label: 'Account' },
];

/** Button for a notification: same destination as tapping its push notification (lib/notificationRoutes). */
function actions(n: AppNotification): { primary?: { label: string; icon?: string; href: Href; dark?: boolean } } {
  const t = notificationTarget(n.data);
  return t ? { primary: t } : {};
}

function bucket(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86400_000;
  if (new Date(iso).toDateString() === new Date().toDateString()) return 'Today';
  if (days < 7) return 'Earlier this week';
  return 'Older';
}

/** Notification centre (Stitch "Vicinity - Notifications"). */
export default function Notifications() {
  const status = useAuth((s) => s.status);
  const wide = useWide();
  const [filter, setFilter] = useState<'ALL' | NotificationCategory>('ALL');
  const list = useNotifications();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['unread-count'] });
  };
  const readOne = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: refresh });

  const all = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const items = all.filter((n) => filter === 'ALL' || n.category === filter);
  const unread = all.filter((n) => !n.readAt).length;
  const sections = useMemo(() => {
    const m = new Map<string, AppNotification[]>();
    for (const n of items) m.set(bucket(n.createdAt), [...(m.get(bucket(n.createdAt)) ?? []), n]);
    return [...m.entries()].map(([title, data]) => ({ title, data }));
  }, [items]);

  const open = (n: AppNotification, href?: Href) => {
    if (!n.readAt) readOne.mutate(n.id);
    const target = href ?? actions(n).primary?.href;
    if (target) router.push(target);
  };

  return (
    <View className="flex-1 bg-surface">
      <AppHeader />
      {status !== 'signedIn' ? (
        <EmptyState icon="notifications" title="Stay in the loop" message="Sign in to get booking updates, messages, reviews and news from providers you follow." action={{ label: 'Sign in', onPress: () => router.push('/login') }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          // NativeWind does not map contentContainerClassName on SectionList, so layout is set as a style.
          contentContainerStyle={{ width: '100%', maxWidth: wide ? 768 : 672, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 112 }}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          onEndReached={() => list.hasNextPage && void list.fetchNextPage()}
          ListHeaderComponent={
            <View className="gap-3 pb-2 pt-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Txt variant="headline-lg" accessibilityRole="header">Notifications</Txt>
                  {unread ? (
                    <View className="rounded-full bg-secondary-container px-2.5 py-0.5">
                      <Txt variant="label-sm" className="text-on-secondary-container">{unread} Unread</Txt>
                    </View>
                  ) : null}
                </View>
                <View className="flex-row items-center gap-1">
                  <Pressable onPress={() => readAll.mutate()} accessibilityRole="button" className="flex-row items-center gap-1 rounded-full px-2 py-2">
                    <Icon name="done_all" size={18} color={colors.primaryDark} />
                    <Txt variant="label-lg" className="text-primary-dark">Mark all read</Txt>
                  </Pressable>
                  <Pressable onPress={() => router.push('/settings/notifications')} accessibilityLabel="Notification settings" className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-container-low">
                    <Icon name="settings" size={20} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-1">
                {FILTERS.map((f) => (
                  <Chip
                    key={f.key}
                    label={f.key === 'ALL' ? `All (${all.length})` : f.label}
                    active={filter === f.key}
                    onPress={() => setFilter(f.key)}
                  />
                ))}
              </ScrollView>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View className="flex-row items-center justify-between pb-2 pt-4">
              <Txt variant="eyebrow" className="text-on-surface-variant">{section.title}</Txt>
              {section.title === 'Today' ? <Txt variant="label-sm" className="font-semibold text-on-surface-variant">Lusaka time</Txt> : null}
            </View>
          )}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item: n }) => {
            const s = STYLE[n.category];
            const a = actions(n);
            return (
              // Only a "button" when it has no buttons inside (nested buttons are invalid HTML on web).
              <Pressable onPress={() => open(n)} accessibilityRole={a.primary ? undefined : 'button'} className="flex-row gap-3 rounded-3xl bg-white p-4 shadow-card active:opacity-95">
                <View>
                  <View className={`h-11 w-11 items-center justify-center rounded-full ${s.bg}`}>
                    <Icon name={s.icon} size={22} color={s.fg} />
                  </View>
                  {!n.readAt ? <View className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-primary" accessibilityLabel="Unread" /> : null}
                </View>
                <View className="flex-1 gap-1">
                  <View className="flex-row items-start justify-between gap-2">
                    <Txt variant="headline-sm" className="flex-1" style={{ fontSize: 17 }}>{n.title}</Txt>
                    <Txt variant="label-md" className="text-on-surface-variant">{timeAgo(n.createdAt)}</Txt>
                  </View>
                  {n.category === 'MESSAGE' ? (
                    <View className="mt-1 rounded-2xl bg-surface-container-low px-3 py-2.5">
                      <Txt variant="body-md" className="italic text-on-surface-variant" numberOfLines={3}>“{n.body}”</Txt>
                    </View>
                  ) : (
                    <Txt variant="body-lg" className="text-on-surface-variant" numberOfLines={3}>{n.body}</Txt>
                  )}
                  {a.primary ? (
                    <View className="mt-2 flex-row items-center gap-3">
                      <Button
                        title={a.primary.label}
                        size="sm"
                        kind={a.primary.dark ? 'brand' : 'primary'}
                        icon={a.primary.dark ? a.primary.icon : undefined}
                        iconRight={a.primary.dark ? undefined : a.primary.icon}
                        onPress={() => open(n, a.primary!.href)}
                      />
                      {!n.readAt ? (
                        <Pressable onPress={() => readOne.mutate(n.id)} accessibilityRole="button" className="px-2 py-2">
                          <Txt variant="label-lg" className="text-on-surface-variant">Dismiss</Txt>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            list.isLoading ? (
              <ListSkeleton rows={5} />
            ) : list.isError ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            ) : (
              <EmptyState icon="notifications" title="You're all caught up" message="Booking updates, messages, reviews and enquiries will appear here." />
            )
          }
        />
      )}
    </View>
  );
}
