import { router } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, Txt } from '@/components/ui';
import { useAuth } from '@/store/auth';

const POINTS = [
  ['Your location', 'Used only to find things near you. Searches store your area rounded to about 1 km, never your exact position.'],
  ['Provider addresses', 'Providers choose whether to show an exact address. If not, customers only see the area and an approximate pin (about 500 m).'],
  ['Contact taps', "When you tap call or WhatsApp, the provider's statistics count the tap. Your phone number is not shared unless you type it into an enquiry."],
  ['Documents', 'Certificates uploaded for verification are private: only you and the verification team can open them.'],
  ['Organizations', 'Members-only listings are visible only to members. Joining an organization never makes your own listings private or public — you choose per listing.'],
  ['Notifications', 'You control which notifications you receive. Promotional messages are off unless you turn them on.'],
] as const;

export default function Privacy() {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  return (
    <Screen back title="Privacy">
      <View className="w-full max-w-xl gap-3 self-center px-margin">
        {POINTS.map(([t, b]) => (
          <Card key={t} className="gap-1">
            <Txt variant="label-lg">{t}</Txt>
            <Txt variant="body-md" className="text-ink-muted">{b}</Txt>
          </Card>
        ))}
        {signedIn ? (
          <>
            <Button title="Notification preferences" kind="secondary" onPress={() => router.push('/settings/notifications')} />
            <Button title="Export or delete my data" kind="outline" onPress={() => router.push('/settings/account')} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}
