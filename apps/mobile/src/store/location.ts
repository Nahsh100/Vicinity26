import { create } from 'zustand';
import * as Location from 'expo-location';
import { api } from '@/lib/api';
import { prefsStorage } from '@/lib/storage';

export interface SelectedLocation {
  lat: number;
  lng: number;
  label: string;
  source: 'gps' | 'manual';
}

export type PermissionState = 'unknown' | 'granted' | 'denied';

interface LocationState {
  location: SelectedLocation | null;
  radiusKm: number;
  permission: PermissionState;
  hydrated: boolean;
  hydrate(): Promise<void>;
  /** Asks for permission (if needed) and reads GPS. Returns null when denied/unavailable — callers fall back to manual selection. */
  useGps(): Promise<SelectedLocation | null>;
  setManual(p: { lat: number; lng: number; label: string }): void;
  setRadius(km: number): void;
}

const KEY = 'vicinity.location';

export const useLocation = create<LocationState>((set, get) => ({
  location: null,
  radiusKm: 10,
  permission: 'unknown',
  hydrated: false,

  async hydrate() {
    const saved = await prefsStorage.get<{ location: SelectedLocation | null; radiusKm: number }>(KEY);
    let permission: PermissionState = 'unknown';
    try {
      const p = await Location.getForegroundPermissionsAsync();
      permission = p.granted ? 'granted' : p.canAskAgain ? 'unknown' : 'denied';
    } catch {
      permission = 'unknown';
    }
    set({ location: saved?.location ?? null, radiusKm: saved?.radiusKm ?? 10, permission, hydrated: true });
  },

  async useGps() {
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) {
        set({ permission: 'denied' });
        return null;
      }
      set({ permission: 'granted' });
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      let label = 'Current location';
      try {
        const place = await api.get<{ name: string; city: string }>('/locations/reverse', { lat, lng });
        label = place.name;
      } catch {
        // Label is cosmetic; keep the generic one offline.
      }
      const location: SelectedLocation = { lat, lng, label, source: 'gps' };
      set({ location });
      void prefsStorage.set(KEY, { location, radiusKm: get().radiusKm });
      return location;
    } catch {
      return null;
    }
  },

  setManual(p) {
    const location: SelectedLocation = { ...p, source: 'manual' };
    set({ location });
    void prefsStorage.set(KEY, { location, radiusKm: get().radiusKm });
  },

  setRadius(radiusKm) {
    set({ radiusKm });
    void prefsStorage.set(KEY, { location: get().location, radiusKm });
  },
}));
