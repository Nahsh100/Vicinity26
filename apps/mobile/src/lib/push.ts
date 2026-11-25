import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

let registeredToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Registers this device for push notifications with the API.
 * Push needs a physical device (or supported simulator), a configured EAS projectId and user consent;
 * on web or when unavailable this resolves to a reason string instead of throwing.
 */
export async function registerForPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (Platform.OS === 'web') return { ok: false, reason: 'Push notifications are available in the mobile app.' };
  if (!Device.isDevice) return { ok: false, reason: 'Push notifications need a physical device.' };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) return { ok: false, reason: 'Push is not configured for this build (missing EAS projectId).' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Vicinity', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { ok: false, reason: 'Notifications are turned off for Vicinity in your phone settings.' };

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post('/notifications/devices', { token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' });
  registeredToken = token;
  return { ok: true };
}

export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  await api.del(`/notifications/devices/${encodeURIComponent(registeredToken)}`);
  registeredToken = null;
}
