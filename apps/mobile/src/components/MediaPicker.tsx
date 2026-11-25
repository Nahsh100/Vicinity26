import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { colors, type MediaPurpose, type MediaRef } from '@vicinity/shared';
import { toApiError } from '@/lib/api';
import { pickMedia, uploadMedia } from '@/lib/upload';
import { Icon, InlineError, Txt } from './ui';

/** Grid of uploaded media with an "Add" tile. Uploads go straight to storage via signed URLs. */
export function MediaPicker({
  value,
  onChange,
  purpose,
  max = 8,
  allowVideo,
  label,
}: {
  value: MediaRef[];
  onChange: (v: MediaRef[]) => void;
  purpose: MediaPurpose;
  max?: number;
  allowVideo?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const files = await pickMedia({ allowVideo, multiple: max > 1, limit: max - value.length });
    if (!files.length) return;
    setBusy(files.length);
    const added: MediaRef[] = [];
    for (const f of files) {
      try {
        added.push(await uploadMedia(f, purpose));
      } catch (e) {
        setError(toApiError(e).message);
      }
      setBusy((b) => b - 1);
    }
    onChange([...value, ...added].slice(0, max));
  };

  return (
    <View className="gap-2">
      {label ? <Txt variant="label-md" className="text-ink-muted">{label} ({value.length}/{max})</Txt> : null}
      <View className="flex-row flex-wrap gap-2">
        {value.map((m, i) => (
          <View key={m.id} className="h-24 w-24 overflow-hidden rounded-xl bg-surface-container">
            {m.kind === 'VIDEO' ? (
              <View className="flex-1 items-center justify-center"><Icon name="movie" size={28} color={colors.secondary} /></View>
            ) : (
              <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            )}
            {i === 0 ? <View className="absolute bottom-1 left-1 rounded-full bg-navy/70 px-1.5"><Txt variant="label-sm" className="text-card">Cover</Txt></View> : null}
            <Pressable accessibilityLabel="Remove" onPress={() => onChange(value.filter((x) => x.id !== m.id))} className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-white/90">
              <Icon name="close" size={14} color={colors.onSurface} />
            </Pressable>
          </View>
        ))}
        {busy > 0
          ? Array.from({ length: busy }).map((_, i) => (
              <View key={`b${i}`} className="h-24 w-24 items-center justify-center rounded-xl bg-surface-low"><ActivityIndicator color={colors.primary} /></View>
            ))
          : null}
        {value.length + busy < max ? (
          <Pressable accessibilityRole="button" accessibilityLabel={allowVideo ? 'Add photos or videos' : 'Add photos'} onPress={add} className="h-24 w-24 items-center justify-center gap-1 rounded-xl border border-dashed border-primary bg-primary-soft">
            <Icon name="add_photo_alternate" size={24} color={colors.primaryDark} />
            <Txt variant="label-sm" className="text-primary-dark">Add</Txt>
          </Pressable>
        ) : null}
      </View>
      <InlineError message={error} />
    </View>
  );
}

/** Single round/rect image (logo, avatar, cover). */
export function SingleImagePicker({ value, onChange, purpose, label, shape = 'circle' }: { value: { id: string; url: string } | null; onChange: (m: MediaRef | null) => void; purpose: MediaPurpose; label: string; shape?: 'circle' | 'wide' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async () => {
    setError(null);
    const [f] = await pickMedia();
    if (!f) return;
    setBusy(true);
    try {
      onChange(await uploadMedia(f, purpose));
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };
  const box = shape === 'circle' ? 'h-24 w-24 rounded-full' : 'h-32 w-full rounded-2xl';
  return (
    <View className="gap-2">
      <Txt variant="label-md" className="text-ink-muted">{label}</Txt>
      <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label}`} onPress={pick} className={`${box} items-center justify-center overflow-hidden border border-dashed border-primary bg-primary-soft`}>
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : value ? (
          <Image source={{ uri: value.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Icon name="add_a_photo" size={26} color={colors.primaryDark} />
        )}
      </Pressable>
      <InlineError message={error} />
    </View>
  );
}
