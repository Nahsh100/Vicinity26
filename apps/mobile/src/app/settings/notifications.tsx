import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import type { NotificationCategory, NotificationPreferences } from '@vicinity/shared';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, ErrorState, InlineError, ListSkeleton, Notice, TextField, Toggle, Txt } from '@/components/ui';
import { useNotificationPrefs } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { registerForPush } from '@/lib/push';

const CATS: { key: NotificationCategory; label: string; description: string }[] = [
  { key: 'ENQUIRY', label: 'Enquiries', description: 'When a customer messages your business' },
  { key: 'REVIEW', label: 'Reviews', description: 'New reviews and replies to your reviews' },
  { key: 'SAVED_PROVIDER', label: 'Saved providers', description: 'New services from providers you saved' },
  { key: 'ORGANIZATION', label: 'Organizations & groups', description: 'Invitations, new members and announcements' },
  { key: 'DISCOVERY', label: 'New near you', description: 'New providers in your area and favourite categories' },
  { key: 'PROMOTION', label: 'Offers & promotions', description: 'Occasional local deals (off by default)' },
];

export default function NotificationSettings() {
  const q = useNotificationPrefs();
  const qc = useQueryClient();
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [quiet, setQuiet] = useState<{ start: string; end: string } | null>(null);
  const m = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) => api.put<NotificationPreferences>('/notifications/preferences', patch),
    onSuccess: (d) => qc.setQueryData(['notification-prefs'], d),
  });
  const p = m.data ?? q.data;

  return (
    <Screen back title="Notifications">
      <View className="w-full max-w-xl gap-4 self-center px-margin">
        {q.isLoading ? <ListSkeleton rows={2} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {p ? (
          <>
            <Card className="gap-1">
              <Toggle label="Push notifications" description="Alerts on this phone" value={p.pushEnabled} onChange={(v) => m.mutate({ pushEnabled: v })} />
              {Platform.OS !== 'web' ? (
                <Button title="Enable on this device" kind="ghost" size="sm" onPress={() => void registerForPush().then((r) => setPushMsg(r.ok ? 'This device will receive notifications.' : r.reason))} />
              ) : (
                <Txt variant="body-sm" className="text-on-surface-variant">Push alerts are available in the Vicinity mobile app. You'll always see notifications here in the notification centre.</Txt>
              )}
              {pushMsg ? <Notice message={pushMsg} /> : null}
            </Card>
            <Card className="gap-1">
              <Txt variant="label-md" className="pb-1 text-ink-muted">WHAT TO NOTIFY ME ABOUT</Txt>
              {CATS.map((c, i) => (
                <View key={c.key}>
                  {i ? <Divider /> : null}
                  <Toggle label={c.label} description={c.description} value={p.categories[c.key]} onChange={(v) => m.mutate({ categories: { ...p.categories, [c.key]: v } })} />
                </View>
              ))}
              <Txt variant="body-sm" className="pt-2 text-on-surface-variant">Account and security messages are always sent.</Txt>
            </Card>
            <Card className="gap-2">
              <Txt variant="label-md" className="text-ink-muted">QUIET HOURS (Lusaka time)</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">{p.quietHoursStart ? `Push alerts wait until ${p.quietHoursEnd} when sent between ${p.quietHoursStart} and ${p.quietHoursEnd}.` : 'Off'}</Txt>
              <View className="flex-row gap-2">
                <View className="flex-1"><TextField placeholder="22:00" value={quiet?.start ?? p.quietHoursStart ?? ''} onChangeText={(t) => setQuiet({ start: t, end: quiet?.end ?? p.quietHoursEnd ?? '' })} /></View>
                <View className="flex-1"><TextField placeholder="06:30" value={quiet?.end ?? p.quietHoursEnd ?? ''} onChangeText={(t) => setQuiet({ start: quiet?.start ?? p.quietHoursStart ?? '', end: t })} /></View>
              </View>
              <View className="flex-row gap-2">
                <Button title="Save quiet hours" size="sm" disabled={!quiet || !/^\d{2}:\d{2}$/.test(quiet.start) || !/^\d{2}:\d{2}$/.test(quiet.end)} onPress={() => quiet && m.mutate({ quietHoursStart: quiet.start, quietHoursEnd: quiet.end })} />
                {p.quietHoursStart ? <Button title="Turn off" size="sm" kind="ghost" onPress={() => { setQuiet(null); m.mutate({ quietHoursStart: null, quietHoursEnd: null }); }} /> : null}
              </View>
            </Card>
            <InlineError message={m.error ? toApiError(m.error).message : null} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}
