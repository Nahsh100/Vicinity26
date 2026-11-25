import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { Screen } from '@/components/Screen';
import { Button, Card, Icon, Txt } from '@/components/ui';

const FAQ = [
  ['How do I find services near me?', 'Set your location from the top of the Home screen (GPS or pick your neighbourhood), then search or tap a category. Use the radius and filters to narrow results.'],
  ['Is Vicinity free?', 'Yes. Searching, contacting providers and creating a basic storefront are free. Optional paid plans for providers will be announced later.'],
  ['How do I offer my services?', 'Go to Profile → Become a provider. You can be an individual — you do not need a registered company. Add a location and at least one listing, then publish.'],
  ['What does "Verified" mean?', 'Our team has checked the provider’s identity or credentials. Always agree on price and details before work starts.'],
  ['How are results ranked?', 'By how well they match your words, how close they are, ratings, how complete the listing is, how recent it is and availability. Paid placements are always labelled "Sponsored" and shown separately.'],
  ['Someone is behaving badly', 'Use "Report" on the review, listing, provider or organization. Our moderators review every report.'],
] as const;

export default function Help() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Screen back title="Help & support">
      <View className="w-full max-w-xl gap-3 self-center px-margin">
        {FAQ.map(([q, a], i) => (
          <Card key={q}>
            <Pressable onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }} className="flex-row items-center justify-between gap-2">
              <Txt variant="label-lg" className="flex-1">{q}</Txt>
              <Icon name={open === i ? 'expand_less' : 'expand_more'} size={20} color={colors.muted} />
            </Pressable>
            {open === i ? <Txt variant="body-md" className="mt-2 text-ink-muted">{a}</Txt> : null}
          </Card>
        ))}
        <Card className="gap-2">
          <Txt variant="headline-sm">Still need help?</Txt>
          <Txt variant="body-md" className="text-on-surface-variant">Email our support team and we'll get back to you.</Txt>
          <Button title="Email support" icon="mail_outline" kind="secondary" onPress={() => void Linking.openURL('mailto:support@vicinity.co.zm')} />
        </Card>
      </View>
    </Screen>
  );
}
