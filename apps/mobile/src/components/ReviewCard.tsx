import { useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { colors, initials, timeAgo, type Review } from '@vicinity/shared';
import { ReportSheet } from './ReportSheet';
import { Icon, Stars, Txt } from './ui';

export function ReviewCard({ r, onRespond }: { r: Review; onRespond?: () => void }) {
  const [report, setReport] = useState(false);
  return (
    <View className="gap-1.5 rounded-2xl bg-surface-low/60 p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary-container">
            <Txt variant="label-md" className="text-navy">{initials(r.author.fullName)}</Txt>
          </View>
          <View>
            <Txt variant="label-md">{r.author.fullName}</Txt>
            <Txt variant="label-sm" className="font-sans text-on-surface-variant">{[r.listing?.title, timeAgo(r.createdAt)].filter(Boolean).join(' • ')}</Txt>
          </View>
        </View>
        <Stars value={r.rating} size={15} />
      </View>
      {r.comment ? <Txt variant="body-md" className="mt-1">{r.comment}</Txt> : null}
      <View className="mt-1 flex-row items-center justify-between">
        {r.isVerifiedInteraction ? (
          <View className="flex-row items-center gap-1">
            <Icon name="verified" size={13} color={colors.tertiary} />
            <Txt variant="label-sm" className="text-tertiary">Contacted via Vicinity</Txt>
          </View>
        ) : (
          <View />
        )}
        <View className="flex-row gap-3">
          {onRespond && !r.response ? (
            <Pressable onPress={onRespond} accessibilityRole="button"><Txt variant="label-md" className="text-primary-dark">Reply</Txt></Pressable>
          ) : null}
          <Pressable onPress={() => setReport(true)} accessibilityRole="button" accessibilityLabel="Report review"><Txt variant="label-md" className="text-on-surface-variant">Report</Txt></Pressable>
        </View>
      </View>
      {r.response ? (
        <View className="mt-1 rounded-xl border-l-2 border-primary bg-white p-2.5">
          <Txt variant="label-sm" className="text-primary-dark">Response from the provider</Txt>
          <Txt variant="body-md">{r.response.body}</Txt>
        </View>
      ) : null}
      <ReportSheet visible={report} onClose={() => setReport(false)} targetType="REVIEW" targetId={r.id} />
    </View>
  );
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, onConfirm: () => void, destructiveLabel = 'Confirm') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: destructiveLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
