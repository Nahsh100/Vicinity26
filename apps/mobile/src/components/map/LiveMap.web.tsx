import 'maplibre-gl/dist/maplibre-gl.css';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { ListingSummary } from '@vicinity/shared';
import { ICON_ALIASES, ICONS } from '../ui/icons.generated';
import { circleRing, MapChrome, pinnable, priceLabel, radiusBounds, SelectedCard, type NearbyMapProps } from './shared';

type MapLibre = typeof import('maplibre-gl');
type MlMap = import('maplibre-gl').Map;
type MlMarker = import('maplibre-gl').Marker;

/**
 * Vector street map (MapLibre GL) for the web app. Style defaults to OpenFreeMap (no key, OSM data);
 * set EXPO_PUBLIC_MAP_STYLE_URL to use another provider (e.g. a MapTiler style URL with your key).
 * MapLibre is loaded lazily so it never weighs on pages without a map.
 */
export const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
const TEAL = '#00A896';
const TEAL_DARK = '#006B5F';
const NAVY = '#0B1C30';

let loader: Promise<MapLibre> | null = null;
function loadMapLibre(): Promise<MapLibre> {
  loader ??= import('maplibre-gl').then((m) => {
    const lib = ((m as unknown as { default?: MapLibre }).default ?? m) as MapLibre;
    return lib;
  });
  return loader;
}

function iconSvg(name: string | null | undefined, color: string, size: number) {
  const key = ICON_ALIASES[name ?? ''] ?? name ?? 'location_on';
  const d = (ICONS[key] ?? ICONS.location_on ?? ICONS.category)![1];
  return `<svg width="${size}" height="${size}" viewBox="0 -960 960 960" aria-hidden="true"><path d="${d}" fill="${color}"/></svg>`;
}

function pinElement(item: ListingSummary, explorer: boolean, active: boolean, onClick: () => void): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', `${item.title}, ${item.provider.displayName}`);
  el.style.cssText = 'border:0;padding:0;background:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;';
  if (explorer) {
    const bg = active ? TEAL_DARK : '#FFFFFF';
    const fg = active ? '#FFFFFF' : NAVY;
    el.innerHTML = `
      <span style="display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;background:${bg};color:${fg};
        font:700 12px 'PlusJakartaSans_700Bold',system-ui,sans-serif;box-shadow:0 6px 18px rgba(11,28,48,.18);white-space:nowrap;">
        ${active ? iconSvg(item.category.icon, '#FFFFFF', 13) : ''}${priceLabel(item)}
      </span>
      <span style="width:2px;height:7px;background:${NAVY};opacity:.6"></span>
      <span style="width:9px;height:9px;border-radius:50%;background:${NAVY};border:2px solid #fff"></span>`;
  } else {
    el.innerHTML = `
      <span style="width:30px;height:30px;border-radius:50%;background:${TEAL_DARK};display:flex;align-items:center;justify-content:center;
        border:2px solid #fff;box-shadow:0 6px 16px rgba(11,28,48,.22)">${iconSvg(item.category.icon, '#FFFFFF', 16)}</span>`;
  }
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

function meElement(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Search centre');
  el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${TEAL_DARK};border:3px solid #fff;box-shadow:0 0 0 8px rgba(0,168,150,.18),0 4px 12px rgba(11,28,48,.25)`;
  return el;
}

export function LiveMap({ origin, radiusKm, items, height = 192, onRecenter, explorer = false, label }: NearbyMapProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<MapLibre | null>(null);
  const markers = useRef<MlMarker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const itemsKey = items.map((i) => i.id).join(",");

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((ml) => {
        if (cancelled || !host.current) return;
        lib.current = ml;
        const center: [number, number] = origin ? [origin.lng, origin.lat] : [28.2833, -15.4167]; // Lusaka
        const m = new ml.Map({
          container: host.current,
          style: MAP_STYLE_URL,
          center,
          zoom: 12,
          attributionControl: false,
          scrollZoom: explorer,
          dragRotate: false,
          pitchWithRotate: false,
          cooperativeGestures: false,
        });
        m.touchZoomRotate.disableRotation();
        // OpenStreetMap attribution is required; small embedded maps keep it clear of page overlays at the bottom.
        m.addControl(new ml.AttributionControl({ compact: true }), explorer ? 'bottom-left' : 'top-left');
        if (explorer) m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
        m.on('load', () => !cancelled && setReady(true));
        m.on('error', (e) => {
          // A missing tile is not fatal; a style that cannot load is.
          if (!m.isStyleLoaded() && (e.error as { status?: number } | undefined)?.status) setFailed(true);
        });
        m.on('click', () => setSelected(null));
        map.current = m;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      markers.current.forEach((mk) => mk.remove());
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Radius circle + camera.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !origin) return;
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [circleRing(origin.lat, origin.lng, radiusKm)] } };
    const src = m.getSource('radius') as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      m.addSource('radius', { type: 'geojson', data });
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': TEAL, 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': TEAL, 'line-width': 2, 'line-dasharray': explorer ? [3, 3] : [1, 0] } });
    }
    const b = radiusBounds(origin.lat, origin.lng, radiusKm);
    m.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: explorer ? 48 : 16, duration: 600, maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, origin?.lat, origin?.lng, radiusKm, explorer]);

  // Pins.
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml) return;
    markers.current.forEach((mk) => mk.remove());
    const next: MlMarker[] = [];
    if (origin) next.push(new ml.Marker({ element: meElement() }).setLngLat([origin.lng, origin.lat]).addTo(m));
    pinnable(items).forEach((item, idx) => {
      const active = selected ? selected === item.id : explorer && idx === 0;
      const el = pinElement(item, explorer, active, () => (explorer ? setSelected((s) => (s === item.id ? null : item.id)) : router.push(`/listing/${item.id}`)));
      next.push(new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([item.position!.lng, item.position!.lat]).addTo(m));
    });
    markers.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, itemsKey, selected, explorer, origin?.lat, origin?.lng]);

  // Keep the canvas sized to its container.
  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.current?.resize());
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);

  const sel = items.find((i) => i.id === selected) ?? null;

  return (
    <View
      style={{ height }}
      className={`relative w-full overflow-hidden ${explorer ? 'rounded-panel' : 'rounded-3xl'} bg-surface-container shadow-card`}
      accessibilityLabel={`Map of ${items.length} results within ${radiusKm} km`}
    >
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {failed ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <View className="rounded-full bg-white/95 px-4 py-2 shadow-soft"><span style={{ font: '600 12px system-ui' }}>Map could not load</span></View>
        </View>
      ) : null}
      <MapChrome origin={origin} radiusKm={radiusKm} explorer={explorer} label={label} onRecenter={onRecenter} hideCaption={!!sel} />
      {explorer && sel ? <SelectedCard item={sel} onClose={() => setSelected(null)} /> : null}
    </View>
  );
}

export const liveMapAvailable = MAP_STYLE_URL !== 'off';
