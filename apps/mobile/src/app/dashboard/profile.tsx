import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, dayName, isValidPhone, normalizePhone, type MediaRef, type ServiceMode } from '@vicinity/shared';
import { LocationSheet } from '@/components/LocationSheet';
import { SingleImagePicker } from '@/components/MediaPicker';
import { confirmAction } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Chip, ErrorState, Icon, InlineError, ListSkeleton, Notice, Segmented, TextField, Toggle, Txt } from '@/components/ui';
import { useMyProvider } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { pickMedia, uploadMedia } from '@/lib/upload';
import { useLocation } from '@/store/location';

const DAYS = [1, 2, 3, 4, 5, 6, 0];

/** Edit everything on the storefront: details, contact, hours, places, service areas, credentials. */
export default function EditStorefront() {
  const me = useMyProvider();
  const qc = useQueryClient();
  const p = me.data;
  const loc = useLocation((s) => s.location);
  const refresh = () => qc.invalidateQueries({ queryKey: ['my-provider'] });

  const [f, setF] = useState({ displayName: '', tagline: '', bio: '', phone: '', whatsapp: '', email: '', website: '', languages: '' });
  const [type, setType] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
  const [mode, setMode] = useState<ServiceMode>('AT_LOCATION');
  const [radius, setRadius] = useState('');
  const [logo, setLogo] = useState<{ id: string; url: string } | null>(null);
  const [cover, setCover] = useState<{ id: string; url: string } | null>(null);
  const [hours, setHours] = useState<Record<number, { open: string; close: string } | null>>({});
  const [locOpen, setLocOpen] = useState(false);
  const [newLoc, setNewLoc] = useState({ label: 'Branch', area: '', city: 'Lusaka', exact: false });
  const [cred, setCred] = useState({ title: '', issuer: '', isPublic: true, doc: null as MediaRef | null });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!p) return;
    setF({ displayName: p.displayName, tagline: p.tagline ?? '', bio: p.bio ?? '', phone: p.phone, whatsapp: p.whatsapp ?? '', email: p.email ?? '', website: p.website ?? '', languages: p.languages.join(', ') });
    setType(p.type);
    setMode(p.serviceMode);
    setRadius(p.serviceRadiusKm ? String(p.serviceRadiusKm) : '');
    setLogo(p.logoMediaId && p.logoUrl ? { id: p.logoMediaId, url: p.logoUrl } : null);
    setCover(p.coverMediaId && p.coverUrl ? { id: p.coverMediaId, url: p.coverUrl } : null);
    const h: Record<number, { open: string; close: string } | null> = {};
    for (const d of DAYS) {
      const w = p.workingHours.find((x) => x.day === d);
      h[d] = w ? { open: w.open, close: w.close } : null;
    }
    setHours(h);
  }, [p]);

  const save = useMutation({
    mutationFn: async () => {
      if (!isValidPhone(f.phone)) throw new Error('Enter a valid phone number');
      if (f.whatsapp && !isValidPhone(f.whatsapp)) throw new Error('Enter a valid WhatsApp number');
      const workingHours = DAYS.flatMap((d) => (hours[d] ? [{ day: d, ...hours[d]! }] : []));
      for (const w of workingHours) if (!/^\d{2}:\d{2}$/.test(w.open) || !/^\d{2}:\d{2}$/.test(w.close)) throw new Error(`Use HH:MM times for ${dayName(w.day)}`);
      await api.patch('/providers/me', {
        type,
        displayName: f.displayName,
        tagline: f.tagline,
        bio: f.bio,
        phone: normalizePhone(f.phone),
        whatsapp: f.whatsapp ? normalizePhone(f.whatsapp) : '',
        email: f.email,
        website: f.website,
        languages: f.languages.split(',').map((s) => s.trim()).filter(Boolean),
        serviceMode: mode,
        serviceRadiusKm: radius ? Number(radius) : null,
        logoMediaId: logo?.id ?? null,
        coverMediaId: cover?.id ?? null,
        workingHours,
      });
    },
    onSuccess: () => {
      setMsg('Saved');
      void refresh();
    },
  });

  const addLocation = useMutation({
    mutationFn: async () => {
      if (!loc) throw new Error('Pick the position on the location selector first');
      await api.post('/providers/me/locations', { label: newLoc.label, area: newLoc.area || loc.label, city: newLoc.city, lat: loc.lat, lng: loc.lng, isPrimary: false, showExactLocation: newLoc.exact });
    },
    onSuccess: () => void refresh(),
  });
  const removeLocation = useMutation({ mutationFn: (id: string) => api.del(`/providers/me/locations/${id}`), onSuccess: () => void refresh() });
  const makePrimary = useMutation({ mutationFn: (id: string) => api.patch(`/providers/me/locations/${id}`, { isPrimary: true }), onSuccess: () => void refresh() });
  const toggleExact = useMutation({ mutationFn: ({ id, v }: { id: string; v: boolean }) => api.patch(`/providers/me/locations/${id}`, { showExactLocation: v }), onSuccess: () => void refresh() });
  const removeArea = useMutation({ mutationFn: (id: string) => api.del(`/providers/me/service-areas/${id}`), onSuccess: () => void refresh() });
  const addArea = useMutation({
    mutationFn: async () => {
      if (!loc) throw new Error('Choose the centre with the location selector');
      const km = Number(radius || 5);
      await api.post('/providers/me/service-areas', { name: loc.label, lat: loc.lat, lng: loc.lng, radiusKm: km });
    },
    onSuccess: () => void refresh(),
  });
  const addCred = useMutation({
    mutationFn: () => api.post('/providers/me/credentials', { title: cred.title, issuer: cred.issuer, isPublic: cred.isPublic, mediaId: cred.doc?.id ?? null }),
    onSuccess: () => {
      setCred({ title: '', issuer: '', isPublic: true, doc: null });
      void refresh();
    },
  });
  const removeCred = useMutation({ mutationFn: (id: string) => api.del(`/providers/me/credentials/${id}`), onSuccess: () => void refresh() });

  if (me.isLoading) return <Screen back title="Edit storefront"><View className="px-margin"><ListSkeleton /></View></Screen>;
  if (!p) return <Screen back title="Edit storefront"><ErrorState error={me.error} onRetry={() => void me.refetch()} /></Screen>;

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const err = (e: unknown) => (e ? toApiError(e).message : null);

  return (
    <Screen back title="Edit storefront">
      <View className="w-full max-w-xl gap-4 self-center px-margin">
        <Card className="gap-3">
          <Txt variant="headline-sm">Details</Txt>
          <Segmented value={type} onChange={setType} options={[{ value: 'INDIVIDUAL', label: 'Individual' }, { value: 'BUSINESS', label: 'Business' }]} />
          <View className="flex-row gap-3">
            <View className="w-28"><SingleImagePicker label="Photo / logo" value={logo} onChange={(m) => setLogo(m ? { id: m.id, url: m.url } : null)} purpose="PROVIDER_LOGO" /></View>
            <View className="flex-1"><SingleImagePicker label="Cover image" shape="wide" value={cover} onChange={(m) => setCover(m ? { id: m.id, url: m.url } : null)} purpose="PROVIDER_COVER" /></View>
          </View>
          <TextField label="Display name" value={f.displayName} onChangeText={set('displayName')} />
          <TextField label="Tagline" value={f.tagline} onChangeText={set('tagline')} maxLength={140} />
          <TextField label="About" multiline value={f.bio} onChangeText={set('bio')} maxLength={3000} />
          <TextField label="Languages (comma separated)" value={f.languages} onChangeText={set('languages')} placeholder="English, Bemba, Nyanja" />
        </Card>

        <Card className="gap-3">
          <Txt variant="headline-sm">Contact</Txt>
          <TextField label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
          <TextField label="WhatsApp" value={f.whatsapp} onChangeText={set('whatsapp')} keyboardType="phone-pad" />
          <TextField label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <TextField label="Website" value={f.website} onChangeText={set('website')} autoCapitalize="none" placeholder="https://" />
        </Card>

        <Card className="gap-3">
          <Txt variant="headline-sm">Working hours</Txt>
          {DAYS.map((d) => (
            <View key={d} className="flex-row items-center gap-2">
              <Pressable onPress={() => setHours((h) => ({ ...h, [d]: h[d] ? null : { open: '08:00', close: '17:00' } }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!hours[d] }} className="w-20 flex-row items-center gap-1">
                <Icon name={hours[d] ? 'check_box' : 'check_box_outline_blank'} size={20} color={colors.primaryDark} />
                <Txt variant="label-md">{dayName(d)}</Txt>
              </Pressable>
              {hours[d] ? (
                <>
                  <View className="flex-1"><TextField value={hours[d]!.open} onChangeText={(t) => setHours((h) => ({ ...h, [d]: { ...h[d]!, open: t } }))} placeholder="08:00" /></View>
                  <Txt variant="body-md">–</Txt>
                  <View className="flex-1"><TextField value={hours[d]!.close} onChangeText={(t) => setHours((h) => ({ ...h, [d]: { ...h[d]!, close: t } }))} placeholder="17:00" /></View>
                </>
              ) : (
                <Txt variant="body-md" className="text-on-surface-variant">Closed</Txt>
              )}
            </View>
          ))}
        </Card>

        <InlineError message={err(save.error) ?? (save.error as Error | null)?.message ?? null} />
        {msg && save.isSuccess ? <Notice tone="success" message="Storefront saved" /> : null}
        <Button title="Save details & hours" loading={save.isPending} onPress={() => save.mutate()} />

        <Card className="gap-3">
          <Txt variant="headline-sm">Places you work from</Txt>
          {p.locations.map((l) => (
            <View key={l.id} className="gap-1 rounded-2xl bg-surface-low p-3">
              <View className="flex-row items-center justify-between">
                <Txt variant="label-lg">{l.label} · {l.area}, {l.city}</Txt>
                {l.isPrimary ? <Badge label="Primary" tone="teal" /> : null}
              </View>
              <Toggle label="Show exact location" description="Off: only the area and an approximate pin are public" value={l.showExactLocation} onChange={(v) => toggleExact.mutate({ id: l.id, v })} />
              <View className="flex-row gap-2">
                {!l.isPrimary ? <Button title="Make primary" size="sm" kind="secondary" onPress={() => makePrimary.mutate(l.id)} /> : null}
                <Button title="Remove" size="sm" kind="ghost" onPress={() => confirmAction('Remove location?', `${l.label} · ${l.area}`, () => removeLocation.mutate(l.id), 'Remove')} />
              </View>
            </View>
          ))}
          <Txt variant="label-md" className="text-ink-muted">Add another place</Txt>
          <Card className="flex-row items-center gap-2 bg-surface-low" onPress={() => setLocOpen(true)}>
            <Icon name="location_on" size={20} color={colors.primary} />
            <Txt variant="body-md" className="flex-1">{loc ? `Position: ${loc.label}` : 'Choose position'}</Txt>
          </Card>
          <View className="flex-row gap-2">
            <View className="flex-1"><TextField label="Label" value={newLoc.label} onChangeText={(t) => setNewLoc((s) => ({ ...s, label: t }))} /></View>
            <View className="flex-1"><TextField label="Area" value={newLoc.area} onChangeText={(t) => setNewLoc((s) => ({ ...s, area: t }))} placeholder={loc?.label} /></View>
          </View>
          <InlineError message={err(addLocation.error)} />
          <Button title="Add place" size="sm" kind="secondary" loading={addLocation.isPending} onPress={() => addLocation.mutate()} />
        </Card>

        <Card className="gap-3">
          <Txt variant="headline-sm">Service coverage</Txt>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'AT_LOCATION', label: 'At my place' }, { value: 'MOBILE', label: 'I travel' }, { value: 'BOTH', label: 'Both' }]} />
          {p.serviceAreas.map((a) => (
            <View key={a.id} className="flex-row items-center justify-between rounded-2xl bg-surface-low px-3 py-2">
              <Txt variant="body-md">{a.name} · {a.radiusKm} km</Txt>
              <Button title="Remove" size="sm" kind="ghost" onPress={() => removeArea.mutate(a.id)} />
            </View>
          ))}
          <View className="flex-row flex-wrap gap-2">
            {['2', '5', '10', '20'].map((k) => <Chip key={k} label={`${k} km`} active={radius === k} onPress={() => setRadius(k)} />)}
          </View>
          <InlineError message={err(addArea.error)} />
          <Button title={`Add area around ${loc?.label ?? 'selected position'}`} size="sm" kind="secondary" loading={addArea.isPending} onPress={() => addArea.mutate()} />
        </Card>

        <Card className="gap-3">
          <Txt variant="headline-sm">Qualifications & credentials</Txt>
          {p.credentials.map((c) => (
            <View key={c.id} className="flex-row items-center justify-between rounded-2xl bg-surface-low px-3 py-2">
              <View className="flex-1">
                <Txt variant="label-lg">{c.title}</Txt>
                <Txt variant="body-sm" className="text-on-surface-variant">{[c.issuer, c.isPublic ? 'Title shown publicly' : 'Private', c.hasDocument ? 'Document on file (private)' : null].filter(Boolean).join(' · ')}</Txt>
              </View>
              <Button title="Remove" size="sm" kind="ghost" onPress={() => removeCred.mutate(c.id)} />
            </View>
          ))}
          <TextField label="Title" value={cred.title} onChangeText={(t) => setCred((s) => ({ ...s, title: t }))} placeholder="e.g. Certified Electrician (ERB)" />
          <TextField label="Issued by" value={cred.issuer} onChangeText={(t) => setCred((s) => ({ ...s, issuer: t }))} />
          <Toggle label="Show the title on my profile" value={cred.isPublic} onChange={(v) => setCred((s) => ({ ...s, isPublic: v }))} />
          <Button
            title={cred.doc ? 'Document attached' : 'Attach certificate (kept private)'}
            icon="attach_file"
            size="sm"
            kind="outline"
            onPress={async () => {
              const [file] = await pickMedia();
              if (file) setCred((s) => ({ ...s, doc: null }));
              if (file) {
                const m = await uploadMedia(file, 'CREDENTIAL').catch(() => null);
                setCred((s) => ({ ...s, doc: m }));
              }
            }}
          />
          <Txt variant="body-sm" className="text-on-surface-variant">Documents are only visible to you and Vicinity's verification team.</Txt>
          <InlineError message={err(addCred.error)} />
          <Button title="Add credential" size="sm" kind="secondary" disabled={cred.title.trim().length < 2} loading={addCred.isPending} onPress={() => addCred.mutate()} />
        </Card>
      </View>
      <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
    </Screen>
  );
}
