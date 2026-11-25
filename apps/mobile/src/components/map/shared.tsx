import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors, formatDistance, type ListingSummary } from '@vicinity/shared';
import { Button, Icon, Thumb, Txt } from '../ui';

/** Props shared by every map implementation (live map on web/native, radar fallback). */
export interface NearbyMapProps {
  origin: { lat: number; lng: number; label?: string | null } | null;
  radiusKm: number;
  items: ListingSummary[];
  height?: number;
  onRecenter?: () => void;
  /** Desktop "map explorer": price-tag pins, scroll zoom, provider card on tap. */
  explorer?: boolean;
  label?: string;
}

const KM_PER_DEG = 111.32;

/** Bounding box of the search circle, for fitting the camera. */
export function radiusBounds(lat: number, lng: number, km: number) {
  const dLat = km / KM_PER_DEG;
  const dLng = km / (KM_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng, dLat, dLng };
}

/** GeoJSON ring approximating the search circle (web). */
export function circleRing(lat: number, lng: number, km: number, steps = 72): [number, number][] {
  const { dLat, dLng } = radiusBounds(lat, lng, km);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

export const priceLabel = (l: ListingSummary) => (l.price != null ? `ZMW ${Math.round(l.price)}` : 'Quote');
export const pinnable = (items: ListingSummary[]) => items.filter((i) => i.position);

/** Card for the selected pin (explorer and native maps). */
export function SelectedCard({ item, onClose }: { item: ListingSummary; onClose: () => void }) {
  return (
    <View className="absolute bottom-3 left-3 right-3 items-center" pointerEvents="box-none">
      <View className="w-full max-w-[340px] gap-2 rounded-3xl bg-white p-3 shadow-raised">
        <View className="flex-row items-center gap-2.5">
          <Thumb uri={item.coverUrl ?? item.provider.logoUrl} name={item.provider.displayName} icon={item.category.icon} size={44} rounded="rounded-xl" />
          <View className="min-w-0 flex-1">
            <Txt variant="label-lg" numberOfLines={1}>{item.provider.displayName}</Txt>
            <View className="flex-row items-center gap-1">
              {item.provider.ratingCount ? <Icon name="star" size={13} color={colors.amber} fill /> : null}
              <Txt variant="body-sm" className="text-on-surface-variant" numberOfLines={1}>
                {[item.provider.ratingCount ? item.provider.ratingAverage.toFixed(1) : null, formatDistance(item.distanceMeters), item.area].filter(Boolean).join(' • ')}
              </Txt>
            </View>
          </View>
          <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={8} className="h-8 w-8 items-center justify-center rounded-full bg-surface-container-low">
            <Icon name="close" size={16} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
        <View className="flex-row items-center justify-between gap-2">
          <Txt variant="label-md" className="flex-1 text-primary-dark" numberOfLines={1}>{item.title} · {priceLabel(item)}</Txt>
          <Button title="View" size="sm" onPress={() => router.push(`/listing/${item.id}`)} />
        </View>
      </View>
    </View>
  );
}

/** Radius chip, explorer caption and re-centre button drawn over any map. */
export function MapChrome({ origin, radiusKm, explorer, label, onRecenter, hideCaption }: Pick<NearbyMapProps, 'origin' | 'radiusKm' | 'explorer' | 'label' | 'onRecenter'> & { hideCaption?: boolean }) {
  return (
    <>
      <View className="absolute left-0 right-0 top-3 items-center" pointerEvents="none">
        <View className="flex-row items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 shadow-soft">
          <View className="h-2 w-2 rounded-full bg-primary-dark" />
          <Txt variant="label-sm">{origin ? `${radiusKm} km radius` : 'Set a location to see the map'}</Txt>
        </View>
      </View>
      {explorer && origin && !hideCaption ? (
        <View className="absolute left-4 top-12 flex-row items-center gap-2 rounded-full bg-white/95 px-4 py-2 shadow-soft" pointerEvents="none">
          <View className="h-2 w-2 rounded-full bg-primary-dark" />
          <Txt variant="label-md">{label ?? `${origin.label ?? 'Your area'} & surroundings`}</Txt>
        </View>
      ) : null}
      {onRecenter ? (
        <Pressable accessibilityLabel="Re-centre on my location" onPress={onRecenter} className="absolute right-3 top-3 h-10 w-10 items-center justify-center rounded-full bg-white shadow-raised active:opacity-80">
          <Icon name="my_location" size={20} color={colors.primaryDark} />
        </Pressable>
      ) : null}
    </>
  );
}
