import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@vicinity/shared';
import { Logo } from '@/components/AppHeader';
import { Button, Icon, Txt } from '@/components/ui';
import { prefsStorage } from '@/lib/storage';

const SLIDES = [
  { icon: 'travel_explore', title: 'Find what you need, nearby', body: 'Plumbers, nail techs, caterers, mechanics, butchers, tutors — discover people and shops in your neighbourhood.' },
  { icon: 'forum', title: 'Connect directly', body: 'Call or WhatsApp providers in one tap. Compare prices, ratings and photos of their work first.' },
  { icon: 'storefront', title: 'Support local — or be found', body: 'Have a skill or something to sell? Create a free storefront. No website or registered company needed.' },
];

/** Welcome + onboarding introduction (shown once). */
export default function Welcome() {
  const [i, setI] = useState(0);
  const s = SLIDES[i]!;
  const last = i === SLIDES.length - 1;

  const finish = async (next: '/location-permission' | '/login') => {
    await prefsStorage.set('vicinity.onboarded', true);
    router.replace(next);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="w-full max-w-md flex-1 self-center justify-between px-6 py-6">
        <View className="flex-row items-center justify-between">
          <Logo />
          <Button title="Skip" kind="ghost" size="sm" onPress={() => void finish('/location-permission')} />
        </View>

        <View className="items-center gap-5">
          <View className="h-44 w-44 items-center justify-center rounded-full bg-primary-soft">
            <View className="h-28 w-28 items-center justify-center rounded-full bg-primary-fixed/50">
              <Icon name={s.icon} size={56} color={colors.primaryDark} />
            </View>
          </View>
          <Txt variant="headline-lg" className="text-center">{s.title}</Txt>
          <Txt variant="body-lg" className="text-center text-ink-muted">{s.body}</Txt>
          <View className="flex-row gap-1.5" accessibilityLabel={`Step ${i + 1} of ${SLIDES.length}`}>
            {SLIDES.map((_, k) => <View key={k} className={`h-2 rounded-full ${k === i ? 'w-6 bg-primary' : 'w-2 bg-outline-variant'}`} />)}
          </View>
        </View>

        <View className="gap-3">
          {last ? (
            <>
              <Button title="Get started" onPress={() => void finish('/location-permission')} />
              <Button title="I already have an account" kind="outline" onPress={() => void finish('/login')} />
            </>
          ) : (
            <Button title="Next" icon="arrow_forward" onPress={() => setI(i + 1)} />
          )}
          <Txt variant="body-sm" className="text-center text-on-surface-variant">Find. Connect. Support Local.</Txt>
        </View>
      </View>
    </SafeAreaView>
  );
}
