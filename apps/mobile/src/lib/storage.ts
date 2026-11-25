import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Secret storage. Native: Keychain / Keystore via expo-secure-store.
 * Web: expo-secure-store is unavailable, so the refresh token is kept in localStorage. That is
 * readable by scripts on the same origin; the web app ships no third-party scripts and the API
 * rotates refresh tokens with reuse detection to limit the impact (see ARCHITECTURE.md).
 */
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

/** Non-secret preferences (selected location, onboarding seen). */
export const prefsStorage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)) : await SecureStore.getItemAsync(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    const raw = JSON.stringify(value);
    if (Platform.OS === 'web') localStorage?.setItem(key, raw);
    else await SecureStore.setItemAsync(key, raw);
  },
};
