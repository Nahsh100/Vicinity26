import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { colors, timeAgo, type ConversationSummary } from '@vicinity/shared';
import { useConversations } from '@/hooks/api';
import { whenLabel } from './BookingCard';
import { Chip, EmptyState, ErrorState, Icon, ListSkeleton, Thumb, Txt } from './ui';

/** Conversation list (left pane of Stitch "Web Messages Hub"). */
export function ConversationList({ selectedId, onSelect }: { selectedId?: string | null; onSelect: (c: ConversationSummary) => void }) {
  const [filter, setFilter] = useState<'all' | 'unread' | 'bookings'>('all');
  const [q, setQ] = useState('');
  const list = useConversations(filter);
  const items = (list.data ?? []).filter((c) => !q.trim() || c.counterpart.name.toLowerCase().includes(q.trim().toLowerCase()));
  const active = (list.data ?? []).filter((c) => c.activeBooking).length;

  return (
    <View className="flex-1 gap-3">
      <View className="flex-row items-center gap-2 px-4 pt-4">
        <Txt variant="headline-md">Messages</Txt>
        {active ? (
          <View className="rounded-full bg-primary-dark px-2.5 py-0.5">
            <Txt variant="label-sm" className="text-white">{active} Active</Txt>
          </View>
        ) : null}
      </View>
      <View className="mx-4 h-11 flex-row items-center gap-2 rounded-full bg-surface-container-low px-4">
        <Icon name="search" size={18} color={colors.outline} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search chats..."
          placeholderTextColor={colors.outline}
          className="flex-1 font-sans text-body-md text-on-surface"
          style={{ outlineStyle: 'none' } as never}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4" className="max-h-10 flex-grow-0">
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Unread" active={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label="Active Bookings" icon={filter === 'bookings' ? undefined : 'event_available'} active={filter === 'bookings'} onPress={() => setFilter('bookings')} />
      </ScrollView>
      <ScrollView contentContainerClassName="gap-1 px-2 pb-6">
        {list.isLoading ? <View className="px-2"><ListSkeleton rows={4} /></View> : null}
        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.isSuccess && !items.length ? (
          <EmptyState icon="chat" title={filter === 'all' ? 'No conversations yet' : 'Nothing here'} message="Message a provider from their profile, or request a booking — your chats appear here." />
        ) : null}
        {items.map((c) => {
          const on = c.id === selectedId;
          return (
            <Pressable key={c.id} onPress={() => onSelect(c)} className={`flex-row gap-3 rounded-3xl p-3 ${on ? 'bg-secondary-fixed/50' : 'active:bg-surface-container-low'}`}>
              <View>
                <Thumb uri={c.counterpart.avatarUrl} name={c.counterpart.name} size={52} rounded="rounded-full" />
                {c.unreadCount ? <View className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-primary" /> : null}
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center justify-between gap-2">
                  <View className="min-w-0 flex-1 flex-row items-center gap-1">
                    <Txt variant="label-lg" numberOfLines={1} className="flex-shrink">{c.counterpart.name}</Txt>
                    {c.counterpart.verified ? <Icon name="verified" size={15} color={colors.primaryDark} /> : null}
                  </View>
                  <Txt variant="label-sm" className={c.unreadCount ? 'text-primary-dark' : 'text-on-surface-variant'}>{timeAgo(c.lastMessageAt)}</Txt>
                </View>
                {c.activeBooking ? (
                  <View className="flex-row items-center gap-1 self-start rounded-full bg-tertiary-fixed/30 px-2 py-0.5">
                    <Icon name="event" size={12} color={colors.tertiary} />
                    <Txt variant="label-sm" className="text-tertiary" numberOfLines={1}>{c.activeBooking.title} • {whenLabel(c.activeBooking.scheduledAt)}</Txt>
                  </View>
                ) : null}
                <View className="flex-row items-center gap-2">
                  <Txt variant="body-sm" numberOfLines={1} className={`flex-1 ${c.unreadCount ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}>{c.lastMessagePreview ?? ''}</Txt>
                  {c.unreadCount ? (
                    <View className="min-w-5 items-center rounded-full bg-primary px-1.5"><Txt variant="label-sm" className="text-white">{c.unreadCount}</Txt></View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

