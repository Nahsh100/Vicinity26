import '../../global.css';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNotificationTaps } from '@/lib/notificationTaps';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Restore session and saved location in parallel; neither blocks on the network for long.
    void Promise.allSettled([useAuth.getState().bootstrap(), useLocation.getState().hydrate()]).then(() => setReady(true));
  }, []);

  const loaded = (fontsLoaded || !!fontError) && ready;
  useNotificationTaps(loaded);
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F8F9FF' } }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
