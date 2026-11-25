import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { colors, type ChatMessage, type ConversationSummary } from '@vicinity/shared';
import { api, toApiError } from '@/lib/api';
import { pickMedia, uploadMedia } from '@/lib/upload';
import { STATUS, whenLabel } from './BookingCard';
import { callProvider } from './ContactActions';
import { notify } from './ReviewCard';
import { BackButton } from './Screen';
import { Icon, IconButton, Thumb, Txt } from './ui';

const QUICK_REPLIES = ['Yes, that works 👍', 'What time works for you?', 'How much will it cost?', 'Can you send a photo?'];

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
function dayLabel(iso: string) {
  const k = dayKey(iso);
  if (k === dayKey(new Date().toISOString())) return 'Today';
  if (k === dayKey(new Date(Date.now() - 86400_000).toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lusaka', weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * One conversation (Stitch "Chat" / right pane of "Web Messages Hub"). Polls every 4 s while open;
 * booking status changes appear as system messages. `embedded` hides the back button (desktop split view).
 */
export function ChatThread({ conversationId, embedded }: { conversationId: string; embedded?: boolean }) {
  const qc = useQueryClient();
  const conv = useQuery({ queryKey: ['conversation', conversationId], queryFn: () => api.get<ConversationSummary>(`/conversations/${conversationId}`), refetchInterval: 30_000 });
  const latest = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.page<ChatMessage>(`/conversations/${conversationId}/messages`, { limit: 50 }),
    refetchInterval: 4000,
  });
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const lastSeen = useRef<string | null>(null);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...(latest.data?.items ?? []), ...older].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [latest.data, older]);
  const cursor = olderCursor === undefined ? latest.data?.meta.nextCursor : olderCursor;

  // Mark read whenever new messages arrive while the thread is open.
  useEffect(() => {
    const newest = messages[0]?.id ?? null;
    if (newest && newest !== lastSeen.current) {
      lastSeen.current = newest;
      void api.post(`/conversations/${conversationId}/read`).then(() => {
        void qc.invalidateQueries({ queryKey: ['unread-messages'] });
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      });
    }
  }, [messages, conversationId, qc]);

  const send = useMutation({
    mutationFn: (body: { body: string; mediaId?: string }) => api.post(`/conversations/${conversationId}/messages`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => notify('Message not sent', toApiError(e).message),
  });

  const submit = (body = text) => {
    const t = body.trim();
    if (!t) return;
    setText('');
    send.mutate({ body: t });
  };

  const attach = async () => {
    const [f] = await pickMedia();
    if (!f) return;
    setUploading(true);
    try {
      const m = await uploadMedia(f, 'LISTING');
      send.mutate({ body: '', mediaId: m.id });
    } catch (e) {
      notify('Upload failed', toApiError(e).message);
    } finally {
      setUploading(false);
    }
  };

  const loadOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await api.page<ChatMessage>(`/conversations/${conversationId}/messages`, { limit: 50, cursor });
      setOlder((o) => [...o, ...r.items]);
      setOlderCursor(r.meta.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  };

  const c = conv.data;
  const booking = c?.activeBooking;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-surface">
      <View className="flex-row items-center gap-3 bg-white/95 px-4 py-3 shadow-soft">
        {!embedded ? <BackButton tone="plain" /> : null}
        {c ? (
          <>
            <Pressable className="flex-1 flex-row items-center gap-3" onPress={() => c.counterpart.providerSlug && router.push(`/provider/${c.counterpart.providerSlug}`)}>
              <Thumb uri={c.counterpart.avatarUrl} name={c.counterpart.name} size={44} rounded="rounded-full" ring />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-1">
                  <Txt variant="headline-sm" numberOfLines={1}>{c.counterpart.name}</Txt>
                  {c.counterpart.verified ? <Icon name="verified" size={16} color={colors.primaryDark} /> : null}
                </View>
                <Txt variant="label-sm" className="font-semibold text-primary-dark">{c.myRole === 'CUSTOMER' ? 'Provider' : 'Customer'} · replies in the app</Txt>
              </View>
            </Pressable>
            {c.counterpart.phone ? <IconButton icon="call" tone="neutral" size={44} label={`Call ${c.counterpart.name}`} onPress={() => c.myRole === 'CUSTOMER' && c.counterpart.providerSlug ? callProvider(c.counterpart.id, c.counterpart.phone!) : void import('react-native').then(({ Linking }) => Linking.openURL(`tel:${c.counterpart.phone}`))} /> : null}
          </>
        ) : (
          <View className="h-11 flex-1" />
        )}
      </View>

      {booking ? (
        <Pressable onPress={() => router.push(`/booking/${booking.id}`)} className="mx-4 mt-3 flex-row items-center gap-3 rounded-3xl bg-white p-3 shadow-card">
          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed/60"><Icon name="event_available" size={20} color={colors.primaryDark} /></View>
          <View className="min-w-0 flex-1">
            <Txt variant="label-lg" numberOfLines={1}>{booking.title}</Txt>
            <Txt variant="body-sm" className="text-on-surface-variant">{whenLabel(booking.scheduledAt)}</Txt>
          </View>
          <View className={`rounded-full px-2.5 py-0.5 ${STATUS[booking.status].box}`}>
            <Txt variant="label-sm" style={{ color: STATUS[booking.status].fg }}>{STATUS[booking.status].label.split(' ')[0]}</Txt>
          </View>
          <Icon name="arrow_forward" size={18} color={colors.primaryDark} />
        </Pressable>
      ) : null}

      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerClassName="px-4 py-3"
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.primary} /> : undefined}
        ListEmptyComponent={
          latest.isLoading ? (
            <ActivityIndicator color={colors.primary} className="mt-10" />
          ) : (
            <View className="items-center gap-2 py-10" style={{ transform: [{ scaleY: -1 }] }}>
              <Icon name="waving_hand" size={32} color={colors.primaryDark} />
              <Txt variant="body-md" className="text-center text-on-surface-variant">Say hello and describe what you need. Messages stay between you and {c?.counterpart.name ?? 'them'}.</Txt>
            </View>
          )
        }
        renderItem={({ item: m, index }) => {
          const prev = messages[index + 1];
          const showDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          return (
            <View>
              {showDay ? (
                <View className="my-3 items-center">
                  <View className="rounded-full bg-surface-container px-3 py-1"><Txt variant="label-sm" className="text-on-surface-variant">{dayLabel(m.createdAt)}</Txt></View>
                </View>
              ) : null}
              <Bubble m={m} avatar={c?.counterpart.avatarUrl} name={c?.counterpart.name ?? ''} />
            </View>
          );
        }}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2 px-4 pb-2" className="max-h-12 flex-grow-0">
        {QUICK_REPLIES.map((r) => (
          <Pressable key={r} onPress={() => submit(r)} className="rounded-full bg-secondary-fixed/60 px-3.5 py-2 active:opacity-80">
            <Txt variant="label-md" className="text-on-secondary-fixed">{r}</Txt>
          </Pressable>
        ))}
      </ScrollView>
      <View className="flex-row items-center gap-2 bg-white/95 px-3 pb-4 pt-2.5">
        <Pressable accessibilityLabel="Attach a photo" onPress={() => void attach()} className="h-11 w-11 items-center justify-center rounded-full bg-surface-container-low">
          {uploading ? <ActivityIndicator color={colors.primary} /> : <Icon name="add" size={22} color={colors.primaryDark} />}
        </Pressable>
        <View className="h-12 flex-1 flex-row items-center rounded-full bg-surface-container-low px-4">
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => submit()}
            placeholder={`Type a message${c ? ` to ${c.counterpart.name.split(' ')[0]}` : ''}...`}
            placeholderTextColor={colors.outline}
            accessibilityLabel="Message"
            className="flex-1 font-sans text-body-lg text-on-surface"
            style={{ outlineStyle: 'none' } as never}
            maxLength={2000}
          />
        </View>
        <Pressable accessibilityLabel="Send" onPress={() => submit()} disabled={!text.trim() || send.isPending} className={`h-12 w-12 items-center justify-center rounded-full bg-primary ${!text.trim() ? 'opacity-60' : ''}`}>
          <Icon name="send" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, avatar, name }: { m: ChatMessage; avatar?: string | null; name: string }) {
  if (m.kind === 'SYSTEM') {
    return (
      <View className="my-2 flex-row items-center justify-center gap-1.5 self-center rounded-2xl bg-tertiary-fixed/25 px-3 py-2" style={{ maxWidth: '90%' }}>
        <Icon name="event_available" size={15} color={colors.tertiary} />
        <Txt variant="body-sm" className="flex-shrink text-on-surface">{m.body}</Txt>
      </View>
    );
  }
  return (
    <View className={`my-1 flex-row items-end gap-2 ${m.mine ? 'justify-end' : 'justify-start'}`}>
      {!m.mine ? <Thumb uri={avatar} name={name} size={30} rounded="rounded-full" /> : null}
      <View className={`gap-1 ${m.mine ? 'items-end' : 'items-start'}`} style={{ maxWidth: '78%' }}>
        <View className={`overflow-hidden ${m.mine ? 'rounded-[22px] rounded-br-md bg-primary' : 'rounded-[22px] rounded-bl-md bg-white shadow-card'} ${m.media ? 'p-1.5' : 'px-4 py-3'}`}>
          {m.media ? <Image source={{ uri: m.media.url }} style={{ width: 230, height: 230, borderRadius: 18 }} contentFit="cover" /> : null}
          {m.body && !(m.media && m.body === 'Photo') ? (
            <Txt variant="body-lg" className={`${m.mine ? 'text-white' : 'text-on-surface'} ${m.media ? 'px-2.5 py-2' : ''}`}>{m.body}</Txt>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1 px-1">
          <Txt variant="label-sm" className="font-semibold text-on-surface-variant">{timeOf(m.createdAt)}</Txt>
          {m.mine ? <Icon name="done_all" size={14} color={colors.primaryDark} /> : null}
        </View>
      </View>
    </View>
  );
}
