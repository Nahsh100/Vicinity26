import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, isValidPhone, normalizePhone, type MediaRef, type ServiceMode } from '@vicinity/shared';
import { ListingForm } from '@/components/ListingForm';
import { LocationSheet } from '@/components/LocationSheet';
import { MediaPicker, SingleImagePicker } from '@/components/MediaPicker';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Chip, EmptyState, Icon, InlineError, Notice, Segmented, TextField, Thumb, Toggle, Txt } from '@/components/ui';
import { useMyProvider } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';

const STEPS = ['Type', 'Details', 'Photo', 'Description', 'Location', 'Coverage', 'First listing', 'Portfolio', 'Contact', 'Preview', 'Publish'] as const;

/**
 * Guided provider onboarding (11 steps). Progress is saved on the server after every step, so a
 * provider can leave and resume where they stopped. Nothing is public until "Publish".
 */
export default function BecomeProvider() {
  const user = useAuth((s) => s.user);
  const refreshUser = useAuth((s) => s.refreshUser);
  const me = useMyProvider();
  const qc = useQueryClient();
  const loc = useLocation((s) => s.location);
  const p = me.data;

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local drafts per step.
  const [type, setType] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [logo, setLogo] = useState<{ id: string; url: string } | null>(null);
  const [bio, setBio] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Lusaka');
  const [exact, setExact] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [mode, setMode] = useState<ServiceMode>('AT_LOCATION');
  const [radius, setRadius] = useState('5');
  const [gallery, setGallery] = useState<MediaRef[]>([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  // Resume from saved progress.
  useEffect(() => {
    if (!p) return;
    setType(p.type);
    setName(p.displayName);
    setTagline(p.tagline ?? '');
    setPhone(p.phone);
    setLogo(p.logoMediaId && p.logoUrl ? { id: p.logoMediaId, url: p.logoUrl } : null);
    setBio(p.bio ?? '');
    setMode(p.serviceMode);
    setRadius(String(p.serviceRadiusKm ?? 5));
    setGallery(p.gallery);
    setWhatsapp(p.whatsapp ?? '');
    setEmail(p.email ?? '');
    if (p.locations[0]) {
      setArea(p.locations[0].area);
      setCity(p.locations[0].city);
    }
    setStep((s) => (s === 0 ? Math.min(Math.max(p.onboardingStep, 1), STEPS.length - 1) : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  useEffect(() => {
    if (loc && !area) {
      setArea(loc.label);
    }
  }, [loc, area]);

  if (!user) {
    return (
      <Screen back title="Become a provider">
        <EmptyState icon="storefront" title="Create an account first" message="It's free. You'll use the same account to find services and to run your storefront." action={{ label: 'Create account', onPress: () => router.push('/register') }} />
      </Screen>
    );
  }
  if (p?.status === 'ACTIVE' && step < 9) {
    return (
      <Screen back title="Your storefront">
        <EmptyState icon="check_circle" title="You're already live" message="Manage your profile, listings and portfolio from your dashboard." action={{ label: 'Open dashboard', onPress: () => router.replace('/dashboard') }} />
      </Screen>
    );
  }

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['my-provider'] });
  };

  const run = async (fn: () => Promise<void>, next = step + 1) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      if (useAuth.getState().user?.providerId) await api.put('/providers/me/onboarding', { step: next }).catch(() => undefined);
      await invalidate();
      setStep(next);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = () =>
    run(async () => {
      if (name.trim().length < 2) throw new Error('Enter your business or trading name');
      if (!isValidPhone(phone)) throw new Error('Enter a valid phone number, e.g. 0971234567');
      const body = { type, displayName: name.trim(), tagline, phone: normalizePhone(phone), serviceMode: mode };
      if (useAuth.getState().user?.providerId) await api.patch('/providers/me', body);
      else {
        await api.post('/providers', body);
        await refreshUser();
      }
    });

  const saveLocation = () =>
    run(async () => {
      if (!loc) throw new Error('Choose where you work from');
      if (!area.trim()) throw new Error('Enter your neighbourhood');
      const existing = p?.locations[0];
      const body = { label: 'Main', area: area.trim(), city: city.trim() || 'Lusaka', lat: loc.lat, lng: loc.lng, isPrimary: true, showExactLocation: exact };
      if (existing) await api.patch(`/providers/me/locations/${existing.id}`, body);
      else await api.post('/providers/me/locations', body);
    });

  const saveCoverage = () =>
    run(async () => {
      const km = Number(radius);
      await api.patch('/providers/me', { serviceMode: mode, serviceRadiusKm: mode === 'AT_LOCATION' ? null : km });
      if (mode !== 'AT_LOCATION') {
        if (!(km >= 0.5 && km <= 200)) throw new Error('Enter a travel distance between 1 and 200 km');
        const base = p?.locations[0];
        if (!base) throw new Error('Add your location first');
        for (const a of p?.serviceAreas ?? []) await api.del(`/providers/me/service-areas/${a.id}`);
        await api.post('/providers/me/service-areas', { name: `${base.area} and surrounds`, lat: base.exactLat, lng: base.exactLng, radiusKm: km });
      }
    });

  const publish = () =>
    run(async () => {
      await api.post('/providers/me/publish');
      await refreshUser();
    }, 10);

  const progress = (step + 1) / STEPS.length;

  return (
    <Screen back title="Your storefront">
      <View className="w-full max-w-xl gap-4 self-center px-margin">
        <View className="gap-1.5">
          <View className="flex-row justify-between">
            <Txt variant="label-md" className="text-primary-dark">Step {Math.min(step + 1, STEPS.length)} of {STEPS.length} · {STEPS[Math.min(step, STEPS.length - 1)]}</Txt>
            {step > 0 && step < 10 ? (
              <Pressable onPress={() => setStep(step - 1)} accessibilityRole="button"><Txt variant="label-md" className="text-on-surface-variant">Back</Txt></Pressable>
            ) : null}
          </View>
          <View className="h-1.5 overflow-hidden rounded-full bg-surface-container"><View className="h-1.5 rounded-full bg-primary" style={{ width: `${progress * 100}%` }} /></View>
        </View>
        <InlineError message={error} />

        {step === 0 ? (
          <>
            <Txt variant="headline-lg">How do you work?</Txt>
            <Txt variant="body-lg" className="text-ink-muted">You don't need a registered company. Individuals with a skill or something to sell are welcome.</Txt>
            {(['INDIVIDUAL', 'BUSINESS'] as const).map((t) => (
              <Pressable key={t} onPress={() => setType(t)} accessibilityRole="radio" accessibilityState={{ checked: type === t }} className={`flex-row items-center gap-3 rounded-3xl border-2 bg-white p-4 ${type === t ? 'border-primary' : 'border-surface-container'}`}>
                <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-soft"><Icon name={t === 'INDIVIDUAL' ? 'person' : 'store'} size={24} color={colors.primaryDark} /></View>
                <View className="flex-1">
                  <Txt variant="headline-sm">{t === 'INDIVIDUAL' ? 'Individual' : 'Business'}</Txt>
                  <Txt variant="body-sm" className="text-on-surface-variant">{t === 'INDIVIDUAL' ? 'A person offering a skill, service or products (nail tech, gardener, tutor, seller…)' : 'A shop, company or team with a trading name'}</Txt>
                </View>
              </Pressable>
            ))}
            <Button title="Continue" onPress={() => setStep(1)} />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Txt variant="headline-lg">Tell customers who you are</Txt>
            <TextField label={type === 'INDIVIDUAL' ? 'Name customers will see' : 'Business name'} value={name} onChangeText={setName} placeholder={type === 'INDIVIDUAL' ? 'e.g. Mutale Nails' : 'e.g. QuickFix Plumbing'} />
            <TextField label="Short tagline" value={tagline} onChangeText={setTagline} maxLength={140} placeholder="e.g. Gel, acrylics and pedicures" />
            <TextField label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="097 123 4567" hint="Customers call you on this number" />
            <Button title="Save and continue" loading={busy} onPress={() => void saveDetails()} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Txt variant="headline-lg">Add a profile photo</Txt>
            <Txt variant="body-lg" className="text-ink-muted">A clear photo of you, your logo or your shop builds trust.</Txt>
            <SingleImagePicker label="Profile photo or logo" value={logo} onChange={(m) => setLogo(m ? { id: m.id, url: m.url } : null)} purpose="PROVIDER_LOGO" />
            <Button title={logo ? 'Save and continue' : 'Skip for now'} kind={logo ? 'primary' : 'secondary'} loading={busy} onPress={() => void run(async () => { if (logo) await api.patch('/providers/me', { logoMediaId: logo.id }); })} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Txt variant="headline-lg">Describe what you do</Txt>
            <TextField label="About you" multiline value={bio} onChangeText={setBio} maxLength={3000} placeholder="Your experience, what you specialise in, where you work, what customers love about you." hint={`${bio.length}/3000 · at least 20 characters recommended`} />
            <Button title="Save and continue" loading={busy} onPress={() => void run(async () => { await api.patch('/providers/me', { bio }); })} />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Txt variant="headline-lg">Where do you work from?</Txt>
            <Txt variant="body-lg" className="text-ink-muted">This places you on the map so nearby customers find you.</Txt>
            <Card className="flex-row items-center gap-3" onPress={() => setLocOpen(true)}>
              <Icon name="location_on" size={24} color={colors.primary} />
              <View className="flex-1">
                <Txt variant="label-lg">{loc ? loc.label : 'Choose location'}</Txt>
                <Txt variant="body-sm" className="text-on-surface-variant">{loc ? (loc.source === 'gps' ? 'From your GPS' : 'Neighbourhood centre') : 'Use GPS or pick your neighbourhood'}</Txt>
              </View>
              <Txt variant="label-md" className="text-primary-dark">Change</Txt>
            </Card>
            <TextField label="Neighbourhood / area" value={area} onChangeText={setArea} placeholder="e.g. Kalingalinga" />
            <TextField label="Town or city" value={city} onChangeText={setCity} />
            <Toggle label="Show my exact location" description="Off: customers only see your area and an approximate position (recommended if you work from home)." value={exact} onChange={setExact} />
            <Button title="Save and continue" loading={busy} onPress={() => void saveLocation()} />
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Txt variant="headline-lg">Where do you serve customers?</Txt>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'AT_LOCATION', label: 'At my place' },
                { value: 'MOBILE', label: 'I travel' },
                { value: 'BOTH', label: 'Both' },
              ]}
            />
            {mode !== 'AT_LOCATION' ? (
              <View className="gap-2">
                <Txt variant="label-md" className="text-ink-muted">How far will you travel?</Txt>
                <View className="flex-row flex-wrap gap-2">
                  {['2', '5', '10', '20', '50'].map((k) => <Chip key={k} label={`${k} km`} active={radius === k} onPress={() => setRadius(k)} />)}
                </View>
                <Txt variant="body-sm" className="text-on-surface-variant">Customers within this distance will see you in their searches even if you're further than their search radius.</Txt>
              </View>
            ) : null}
            <Button title="Save and continue" loading={busy} onPress={() => void saveCoverage()} />
          </>
        ) : null}

        {step === 6 ? (
          <>
            <Txt variant="headline-lg">Add your first service or product</Txt>
            <Txt variant="body-lg" className="text-ink-muted">You can add more later. It goes live when you publish.</Txt>
            {p?.counts.listings ? <Notice tone="success" icon="check_circle" message={`You have ${p.counts.listings} listing${p.counts.listings > 1 ? 's' : ''}. Add another or continue.`} /> : null}
            {p?.counts.listings ? <Button title="Continue" kind="secondary" onPress={() => void run(async () => undefined)} /> : null}
            <ListingForm
              submitLabel="Save listing"
              onSubmit={async (v) => {
                try {
                  await api.post('/listings', v);
                } catch (e) {
                  throw toApiError(e);
                }
                await run(async () => undefined);
              }}
            />
          </>
        ) : null}

        {step === 7 ? (
          <>
            <Txt variant="headline-lg">Show your work</Txt>
            <Txt variant="body-lg" className="text-ink-muted">Photos of finished jobs, products or your workspace. Before-and-after shots work well.</Txt>
            <MediaPicker label="Gallery" value={gallery} onChange={setGallery} purpose="PROVIDER_GALLERY" allowVideo max={24} />
            <Button title={gallery.length ? 'Save and continue' : 'Skip for now'} kind={gallery.length ? 'primary' : 'secondary'} loading={busy} onPress={() => void run(async () => { await api.put('/providers/me/gallery', { mediaIds: gallery.map((g) => g.id) }); })} />
          </>
        ) : null}

        {step === 8 ? (
          <>
            <Txt variant="headline-lg">How can customers reach you?</Txt>
            <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <TextField label="WhatsApp (optional)" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="Same as phone?" />
            {!whatsapp && phone ? <Button title="Use my phone number for WhatsApp" kind="ghost" size="sm" onPress={() => setWhatsapp(phone)} /> : null}
            <TextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Button
              title="Save and continue"
              loading={busy}
              onPress={() =>
                void run(async () => {
                  if (!isValidPhone(phone)) throw new Error('Enter a valid phone number');
                  if (whatsapp && !isValidPhone(whatsapp)) throw new Error('Enter a valid WhatsApp number');
                  await api.patch('/providers/me', { phone: normalizePhone(phone), whatsapp: whatsapp ? normalizePhone(whatsapp) : '', email });
                })
              }
            />
          </>
        ) : null}

        {step === 9 && p ? (
          <>
            <Txt variant="headline-lg">Preview your storefront</Txt>
            <Card className="gap-3 p-4">
              <View className="flex-row items-center gap-3">
                <Thumb uri={p.logoUrl} name={p.displayName} size={64} rounded="rounded-full" />
                <View className="flex-1">
                  <Txt variant="headline-sm">{p.displayName}</Txt>
                  {p.tagline ? <Txt variant="body-sm" className="text-on-surface-variant">{p.tagline}</Txt> : null}
                  <Txt variant="body-sm" className="text-secondary">{p.locations[0] ? `${p.locations[0].area}, ${p.locations[0].city}` : 'No location yet'}</Txt>
                </View>
              </View>
              {p.bio ? <Txt variant="body-md" numberOfLines={4} className="text-ink-muted">{p.bio}</Txt> : null}
            </Card>
            <Card className="gap-2">
              <Txt variant="label-md" className="text-ink-muted">CHECKLIST</Txt>
              {(
                [
                  ['details', 'Name and phone', true],
                  ['location', 'Location', true],
                  ['listing', 'At least one listing', true],
                  ['photo', 'Profile photo', false],
                  ['description', 'Description', false],
                  ['portfolio', 'Portfolio photos', false],
                  ['contact', 'WhatsApp or email', false],
                ] as const
              ).map(([k, label, required]) => (
                <View key={k} className="flex-row items-center gap-2">
                  <Icon name={p.checklist[k] ? 'check_circle' : required ? 'error_outline' : 'radio_button_unchecked'} size={18} color={p.checklist[k] ? colors.primary : required ? colors.error : colors.muted} />
                  <Txt variant="body-md" className="flex-1">{label}</Txt>
                  {required && !p.checklist[k] ? <Badge label="Required" tone="error" /> : null}
                </View>
              ))}
            </Card>
            <Button title="Open full preview" kind="outline" icon="visibility" onPress={() => router.push(`/provider/${p.slug}`)} />
            <Button title="Continue" disabled={!p.canPublish} onPress={() => setStep(10)} />
          </>
        ) : null}

        {step === 10 && p ? (
          <>
            <Txt variant="headline-lg">{p.status === 'ACTIVE' ? 'You are live!' : 'Ready to go live?'}</Txt>
            {p.status === 'ACTIVE' ? (
              <>
                <Notice tone="success" icon="celebration" message="People near you can now find your services. Share your profile with your customers." />
                <Button title="Go to my dashboard" onPress={() => router.replace('/dashboard')} />
                <Button title="View my profile" kind="outline" onPress={() => router.push(`/provider/${p.slug}`)} />
              </>
            ) : (
              <>
                <Txt variant="body-lg" className="text-ink-muted">Publishing makes your profile and listings searchable by people nearby. You can pause anytime.</Txt>
                <Button title="Publish my storefront" icon="rocket_launch" loading={busy} onPress={() => void publish()} />
              </>
            )}
          </>
        ) : null}
      </View>
      <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
    </Screen>
  );
}
