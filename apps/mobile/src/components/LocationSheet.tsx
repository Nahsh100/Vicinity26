import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, RADIUS_OPTIONS_KM } from '@vicinity/shared';
import { api } from '@/lib/api';
import { useLocation } from '@/store/location';
import { Button, Chip, Icon, InlineError, Sheet, TextField, Txt } from './ui';

interface Place {
  name: string;
  city: string;
  kind: 'neighbourhood' | 'town';
  lat: number;
  lng: number;
}

/**
 * Location selector: GPS or a manually chosen neighbourhood/town, plus search radius.
 * Manual selection always works, including when location permission is denied.
 */
export function LocationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { location, radiusKm, permission, useGps, setManual, setRadius } = useLocation();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const places = useQuery({ queryKey: ['places', q], queryFn: () => api.get<Place[]>('/locations/places', { q, limit: 12 }), enabled: visible });

  const gps = async () => {
    setBusy(true);
    setError(null);
    const r = await useGps();
    setBusy(false);
    if (r) onClose();
    else setError('We could not get your location. Allow location access in settings, or choose your area below.');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Your location">
      <Button
        title={busy ? 'Locating…' : 'Use my current location'}
        icon="my_location"
        loading={busy}
        onPress={gps}
        kind={location?.source === 'gps' ? 'secondary' : 'primary'}
      />
      {permission === 'denied' ? (
        <Txt variant="body-sm" className="text-on-surface-variant">Location access is off. You can still pick your neighbourhood or town.</Txt>
      ) : null}
      <InlineError message={error} />

      <View className="gap-2">
        <Txt variant="label-md" className="text-ink-muted">Search radius</Txt>
        <View className="flex-row flex-wrap gap-2">
          {RADIUS_OPTIONS_KM.map((km) => (
            <Chip key={km} label={`${km} km`} active={radiusKm === km} onPress={() => setRadius(km)} />
          ))}
          <View className="w-28">
            <TextField
              placeholder="Custom km"
              value={custom}
              keyboardType="number-pad"
              onChangeText={(t) => setCustom(t.replace(/\D/g, ''))}
              onSubmitEditing={() => {
                const n = Number(custom);
                if (n >= 1 && n <= 200) setRadius(n);
              }}
            />
          </View>
        </View>
        {!RADIUS_OPTIONS_KM.includes(radiusKm as never) ? <Txt variant="body-sm" className="text-primary-dark">Custom radius: {radiusKm} km</Txt> : null}
      </View>

      <TextField icon="search" placeholder="Search neighbourhood or town (e.g. Woodlands)" value={q} onChangeText={setQ} autoCorrect={false} />
      <View className="gap-1">
        {(places.data ?? []).map((p) => {
          const selected = location?.source === 'manual' && location.label === p.name;
          return (
            <Pressable
              key={`${p.name}-${p.city}`}
              accessibilityRole="button"
              onPress={() => {
                setManual({ lat: p.lat, lng: p.lng, label: p.name });
                onClose();
              }}
              className={`flex-row items-center gap-3 rounded-2xl px-3 py-3 ${selected ? 'bg-primary-soft' : 'active:bg-surface-low'}`}
            >
              <Icon name={p.kind === 'town' ? 'location_city' : 'place'} size={20} color={colors.primaryDark} />
              <View className="flex-1">
                <Txt variant="label-lg">{p.name}</Txt>
                <Txt variant="body-sm" className="text-on-surface-variant">{p.kind === 'town' ? 'Town' : p.city}</Txt>
              </View>
              {selected ? <Icon name="check" size={18} color={colors.primaryDark} /> : null}
            </Pressable>
          );
        })}
        {places.isSuccess && !places.data.length ? <Txt variant="body-md" className="text-on-surface-variant">No matching places. Try a nearby area.</Txt> : null}
      </View>
    </Sheet>
  );
}
