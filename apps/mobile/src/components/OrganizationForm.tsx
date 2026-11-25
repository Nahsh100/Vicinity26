import { useState } from 'react';
import { View } from 'react-native';
import { organizationSchema, OrganizationType, type Organization } from '@vicinity/shared';
import { useLocation } from '@/store/location';
import { SingleImagePicker } from './MediaPicker';
import { Button, Chip, InlineError, TextField, Toggle, Txt } from './ui';

export function OrganizationForm({ initial, submitLabel, onSubmit }: { initial?: Organization; submitLabel: string; onSubmit: (v: unknown) => Promise<void> }) {
  const loc = useLocation((s) => s.location);
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<(typeof OrganizationType)[number]>(initial?.type ?? 'COMMUNITY');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false);
  const [locationName, setLocationName] = useState(initial?.locationName ?? loc?.label ?? '');
  const [logo, setLogo] = useState<{ id: string; url: string } | null>(null);
  const [cover, setCover] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const parsed = organizationSchema.safeParse({
      name,
      type,
      description,
      isPrivate,
      locationName,
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      ...(logo ? { logoMediaId: logo.id } : {}),
      ...(cover ? { coverMediaId: cover.id } : {}),
    });
    if (!parsed.success) return setErr(parsed.error.issues[0]?.message ?? 'Check the form');
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-4">
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Northmead Assembly" />
      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Type</Txt>
        <View className="flex-row flex-wrap gap-2">
          {OrganizationType.map((t) => <Chip key={t} label={t.charAt(0) + t.slice(1).toLowerCase()} active={type === t} onPress={() => setType(t)} />)}
        </View>
      </View>
      <TextField label="Description" multiline value={description} onChangeText={setDescription} />
      <TextField label="Location" value={locationName} onChangeText={setLocationName} placeholder="e.g. Northmead, Lusaka" />
      <Toggle label="Invite only" description="Private organizations are hidden from discovery. Members join by invitation." value={isPrivate} onChange={setIsPrivate} />
      <View className="flex-row gap-3">
        <View className="w-28"><SingleImagePicker label="Logo" value={logo ?? (initial?.logoUrl ? { id: '', url: initial.logoUrl } : null)} onChange={(m) => setLogo(m ? { id: m.id, url: m.url } : null)} purpose="ORGANIZATION_LOGO" /></View>
        <View className="flex-1"><SingleImagePicker label="Cover" shape="wide" value={cover ?? (initial?.coverUrl ? { id: '', url: initial.coverUrl } : null)} onChange={(m) => setCover(m ? { id: m.id, url: m.url } : null)} purpose="ORGANIZATION_COVER" /></View>
      </View>
      <InlineError message={err} />
      <Button title={submitLabel} loading={busy} onPress={() => void submit()} />
    </View>
  );
}
