import { liveMapAvailable, LiveMap } from './map/LiveMap';
import type { NearbyMapProps } from './map/shared';
import { RadarMap } from './RadarMap';

/**
 * The app's map. A real street map (MapLibre on web, Apple/Google Maps on phones) when available;
 * the key-free radar view otherwise (EXPO_PUBLIC_MAP_STYLE_URL=off on web, or an Android build
 * without a Google Maps key). Pins always use providers' public, approximate positions.
 */
export function NearbyMap(props: NearbyMapProps) {
  return liveMapAvailable ? <LiveMap {...props} /> : <RadarMap {...props} />;
}

export type { NearbyMapProps };
