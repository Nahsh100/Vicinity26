import { router } from 'expo-router';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, formatDistance, type ListingSummary } from '@vicinity/shared';
import { Button, Icon, Thumb, Txt } from './ui';

const KM_PER_DEG = 111.32;

/**
 * The "radar" map from the Stitch search designs: the user at the centre, the search radius as a
 * glowing ring, and one pin per result at its real (public, approximate) offset. Works the same on
 * iOS, Android and web without a map API key. `explorer` adds the web style: price-tag pins,
 * a dashed radius, area labels and a provider popover.
 */
export function RadarMap({
  origin,
  radiusKm,
  items,
  height = 192,
  onRecenter,
  explorer = false,
  label,
}: {
  origin: { lat: number; lng: number; label?: string | null } | null;
  radiusKm: number;
  items: ListingSummary[];
  height?: number;
  onRecenter?: () => void;
  explorer?: boolean;
  label?: string;
}) {
  const [w, setW] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const R = Math.max(40, Math.min(w, height) / 2 - (explorer ? 48 : 14));

  const pins = origin
    ? items
        .filter((i) => i.position)
        .map((i) => {
          const dy = (i.position!.lat - origin.lat) * KM_PER_DEG;
          const dx = (i.position!.lng - origin.lng) * KM_PER_DEG * Math.cos((origin.lat * Math.PI) / 180);
          const scale = R / Math.max(radiusKm, 0.5);
          // Results served via a provider's service area can lie outside the circle: clamp to the edge.
          const len = Math.hypot(dx, dy) * scale;
          const k = len > R ? R / len : 1;
          return { item: i, x: w / 2 + dx * scale * k, y: height / 2 - dy * scale * k };
        })
    : [];
  const sel = pins.find((p) => p.item.id === selected) ?? null;

  return (
    <View
      onLayout={onLayout}
      style={{ height }}
      className={`relative w-full overflow-hidden ${explorer ? 'rounded-panel' : 'rounded-3xl'} bg-surface-container shadow-card`}
      accessibilityLabel={`Map of ${items.length} results within ${radiusKm} km`}
    >
      <Svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', opacity: 0.85 }}>
        <Rect width="100%" height="100%" fill="#E9EEF5" />
        <Path d="M-20 40 L420 160" stroke="#FFFFFF" strokeWidth={12} strokeLinecap="round" />
        <Path d="M-20 40 L420 160" stroke="#D3DFEE" strokeWidth={8} strokeLinecap="round" />
        <Path d="M120 -20 L80 220" stroke="#FFFFFF" strokeWidth={14} />
        <Path d="M120 -20 L80 220" stroke="#D3DFEE" strokeWidth={10} />
        <Path d="M280 -20 L320 220" stroke="#FFFFFF" strokeWidth={10} />
        <Path d="M280 -20 L320 220" stroke="#D3DFEE" strokeWidth={6} />
        <Path d="M-20 140 C100 130 180 80 420 70" fill="none" stroke="#FFFFFF" strokeWidth={9} />
        <Path d="M-20 140 C100 130 180 80 420 70" fill="none" stroke="#CBDCEE" strokeWidth={6} />
        <Rect x={20} y={55} width={45} height={60} rx={6} fill="#DEE7F2" opacity={0.6} />
        <Rect x={140} y={20} width={70} height={40} rx={6} fill="#DEE7F2" opacity={0.6} />
        <Rect x={150} y={110} width={100} height={50} rx={8} fill="#DEE7F2" opacity={0.5} />
        <Rect x={290} y={30} width={70} height={60} rx={6} fill="#DEE7F2" opacity={0.6} />
        <Rect x={330} y={110} width={50} height={40} rx={6} fill="#DEE7F2" opacity={0.6} />
      </Svg>

      {w > 0 && origin ? (
        <>
          {explorer ? (
            <Svg width={w} height={height} style={{ position: 'absolute' }} pointerEvents="none">
              <Circle cx={w / 2} cy={height / 2} r={R} fill="rgba(0,168,150,0.10)" stroke="#00A896" strokeWidth={2} strokeDasharray="7 7" />
              <Circle cx={w / 2} cy={height / 2} r={R * 0.55} fill="rgba(0,168,150,0.08)" />
            </Svg>
          ) : (
            <View pointerEvents="none" style={{ position: 'absolute', left: w / 2 - R, top: height / 2 - R, width: R * 2, height: R * 2 }} className="items-center justify-center rounded-full bg-primary-fixed/20">
              <View style={{ width: R * 1.4, height: R * 1.4 }} className="items-center justify-center rounded-full bg-primary-fixed/30">
                <View style={{ width: R * 0.8, height: R * 0.8 }} className="rounded-full bg-primary/20" />
              </View>
            </View>
          )}
          <View pointerEvents="none" style={{ position: 'absolute', left: w / 2 - 9, top: height / 2 - 9 }} className="h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-primary-dark shadow-raised">
            <View className="h-1.5 w-1.5 rounded-full bg-white" />
          </View>

          {pins.map(({ item, x, y }, idx) =>
            explorer ? (
              <Pressable
                key={item.id}
                accessibilityLabel={`${item.title}, ${item.provider.displayName}`}
                onPress={() => setSelected(item.id === selected ? null : item.id)}
                style={{ position: 'absolute', left: x - 36, top: y - 34, width: 72 }}
                className="items-center"
              >
                <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 shadow-raised ${selected === item.id || (!selected && idx === 0) ? 'bg-primary-dark' : 'bg-white'}`}>
                  {selected === item.id || (!selected && idx === 0) ? <Icon name={item.category.icon ?? 'place'} size={12} color="#FFFFFF" /> : null}
                  <Txt variant="label-sm" className={selected === item.id || (!selected && idx === 0) ? 'text-white' : 'text-on-surface'} numberOfLines={1}>
                    {item.price != null ? `ZMW ${Math.round(item.price)}` : 'Quote'}
                  </Txt>
                </View>
                <View className="h-2 w-0.5 bg-navy/60" />
                <View className="h-2 w-2 rounded-full border-2 border-white bg-navy" />
              </Pressable>
            ) : (
              <Pressable
                key={item.id}
                accessibilityLabel={`${item.title}, ${item.provider.displayName}`}
                onPress={() => router.push(`/listing/${item.id}`)}
                style={{ position: 'absolute', left: x - 14, top: y - 30 }}
                className="items-center"
              >
                <View className={`h-7 w-7 items-center justify-center rounded-full shadow-raised ${idx % 3 === 1 ? 'bg-error' : 'bg-primary-dark'}`}>
                  <Icon name={item.category.icon ?? 'place'} size={15} color="#FFFFFF" />
                </View>
                <View className={`-mt-1 h-2 w-2 rotate-45 ${idx % 3 === 1 ? 'bg-error' : 'bg-primary-dark'}`} />
              </Pressable>
            ),
          )}

          {explorer && sel ? (
            <View style={{ position: 'absolute', left: Math.max(12, Math.min(w - 272, sel.x - 130)), top: Math.max(56, sel.y - 150) }} className="w-[260px] gap-2 rounded-3xl bg-white p-3 shadow-raised">
              <View className="flex-row items-center gap-2.5">
                <Thumb uri={sel.item.coverUrl ?? sel.item.provider.logoUrl} name={sel.item.provider.displayName} icon={sel.item.category.icon} size={44} rounded="rounded-xl" />
                <View className="min-w-0 flex-1">
                  <Txt variant="label-lg" numberOfLines={1}>{sel.item.provider.displayName}</Txt>
                  <View className="flex-row items-center gap-1">
                    {sel.item.provider.ratingCount ? <Icon name="star" size={13} color={colors.amber} fill /> : null}
                    <Txt variant="body-sm" className="text-on-surface-variant" numberOfLines={1}>
                      {[sel.item.provider.ratingCount ? sel.item.provider.ratingAverage.toFixed(1) : null, formatDistance(sel.item.distanceMeters)].filter(Boolean).join(' • ')}
                    </Txt>
                  </View>
                </View>
              </View>
              <View className="flex-row items-center justify-between">
                <Txt variant="label-md" className="text-primary-dark" numberOfLines={1}>{sel.item.title}</Txt>
                <Button title="View" size="sm" onPress={() => router.push(`/listing/${sel.item.id}`)} />
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      <View className="absolute left-0 right-0 top-3 items-center" pointerEvents="none">
        <View className="flex-row items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 shadow-soft">
          <View className="h-2 w-2 rounded-full bg-primary-dark" />
          <Txt variant="label-sm">{origin ? `${radiusKm} km radius` : 'Set a location to see the map'}</Txt>
        </View>
      </View>
      {explorer && origin ? (
        <View className="absolute bottom-4 left-4 flex-row items-center gap-2 rounded-full bg-white/95 px-4 py-2 shadow-soft" pointerEvents="none">
          <View className="h-2 w-2 rounded-full bg-primary-dark" />
          <Txt variant="label-md">{label ?? `Live radar: ${origin.label ?? 'your area'} & surroundings`}</Txt>
        </View>
      ) : null}
      {onRecenter ? (
        <Pressable accessibilityLabel="Re-centre on my location" onPress={onRecenter} className="absolute bottom-3 right-3 h-10 w-10 items-center justify-center rounded-full bg-white shadow-raised active:opacity-80">
          <Icon name="my_location" size={20} color={colors.primaryDark} />
        </Pressable>
      ) : null}
    </View>
  );
}
