import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@vicinity/shared';
import { LocationSheet } from '@/components/LocationSheet';
import { Button, Icon, Notice, Txt } from '@/components/ui';
import { useLocation } from '@/store/location';

/** Explains why we ask for location before the OS prompt, and offers manual selection instead. */
export default function LocationPermission() {
  const useGps = useLocation((s) => s.useGps);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [manual, setManual] = useState(false);

  const allow = async () => {
    setBusy(true);
    const r = await useGps();
    setBusy(false);
    if (r) router.replace('/');
    else setDenied(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="w-full max-w-md flex-1 self-center justify-between px-6 py-8">
        <View />
        <View className="items-center gap-4">
          <View className="h-36 w-36 items-center justify-center rounded-full bg-primary-soft">
            <Icon name="location_on" size={64} color={colors.primary} />
          </View>
          <Txt variant="headline-lg" className="text-center">See what's close to you</Txt>
          <Txt variant="body-lg" className="text-center text-ink-muted">
            Vicinity uses your location only to show services and products nearby and how far away they are. We never share your exact position with providers.
          </Txt>
          {denied ? <Notice tone="warning" icon="location_off" message="Location is off. No problem — choose your neighbourhood or town instead." /> : null}
        </View>
        <View className="gap-3">
          <Button title="Use my location" icon="my_location" loading={busy} onPress={allow} />
          <Button title="Choose my area manually" kind="outline" onPress={() => setManual(true)} />
          <Button title="Not now" kind="ghost" onPress={() => router.replace('/')} />
        </View>
      </View>
      <LocationSheet
        visible={manual}
        onClose={() => {
          setManual(false);
          if (useLocation.getState().location) router.replace('/');
        }}
      />
    </SafeAreaView>
  );
}
