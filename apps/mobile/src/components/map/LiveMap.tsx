import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '@vicinity/shared';
import { Icon, Txt } from '../ui';
import { MapChrome, pinnable, priceLabel, radiusBounds, SelectedCard, type NearbyMapProps } from './shared';

/**
 * Native street map: Apple Maps on iOS (no key), Google Maps on Android. Android store builds need
 * GOOGLE_MAPS_ANDROID_API_KEY at build time (app.config.js); Expo Go ships its own key.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { androidMapsConfigured?: boolean };
export const liveMapAvailable =
  Platform.OS === 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient || !!extra.androidMapsConfigured;

export function LiveMap({ origin, radiusKm, items, height = 192, onRecenter, explorer = false, label }: NearbyMapProps) {
  const ref = useRef<MapView>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const region = useMemo(() => {
    const lat = origin?.lat ?? -15.4167;
    const lng = origin?.lng ?? 28.2833; // Lusaka
    const b = radiusBounds(lat, lng, Math.max(radiusKm, 0.5) * 1.2);
    return { latitude: lat, longitude: lng, latitudeDelta: b.dLat * 2, longitudeDelta: b.dLng * 2 };
  }, [origin?.lat, origin?.lng, radiusKm]);

  useEffect(() => {
    ref.current?.animateToRegion(region, 500);
  }, [region]);

  const pins = pinnable(items);
  const sel = items.find((i) => i.id === selected) ?? null;

  return (
    <View style={{ height }} className={`relative w-full overflow-hidden ${explorer ? 'rounded-panel' : 'rounded-3xl'} bg-surface-container shadow-card`}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        onPress={() => setSelected(null)}
        accessibilityLabel={`Map of ${items.length} results within ${radiusKm} km`}
      >
        {origin ? (
          <>
            <Circle center={{ latitude: origin.lat, longitude: origin.lng }} radius={radiusKm * 1000} fillColor="rgba(0,168,150,0.10)" strokeColor={colors.primary} strokeWidth={2} />
            <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} accessibilityLabel="Search centre">
              <View className="h-[18px] w-[18px] rounded-full border-[3px] border-white bg-primary-dark" />
            </Marker>
          </>
        ) : null}
        {pins.map((item, idx) => {
          const active = selected ? selected === item.id : explorer && idx === 0;
          return (
            <Marker
              key={`${item.id}:${active ? 1 : 0}`}
              coordinate={{ latitude: item.position!.lat, longitude: item.position!.lng }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              accessibilityLabel={`${item.title}, ${item.provider.displayName}`}
              onPress={(e) => {
                e.stopPropagation();
                setSelected(item.id);
              }}
            >
              {explorer ? (
                <View className={`rounded-full px-2.5 py-1 ${active ? 'bg-primary-dark' : 'bg-white'}`}>
                  <Txt variant="label-sm" className={active ? 'text-white' : 'text-on-surface'}>{priceLabel(item)}</Txt>
                </View>
              ) : (
                <View className={`h-8 w-8 items-center justify-center rounded-full border-2 border-white ${active ? 'bg-navy' : 'bg-primary-dark'}`}>
                  <Icon name={item.category.icon ?? 'location_on'} size={16} color="#FFFFFF" />
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>
      <MapChrome origin={origin} radiusKm={radiusKm} explorer={explorer} label={label} onRecenter={onRecenter} hideCaption={!!sel} />
      {sel ? <SelectedCard item={sel} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}
