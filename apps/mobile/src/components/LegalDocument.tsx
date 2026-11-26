import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { LEGAL, type LegalDoc } from '@/lib/legal';
import { Screen } from './Screen';
import { Txt } from './ui';

/** Renders a privacy policy / terms document. Public: no sign-in needed. */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <Screen back title={doc.title} subtitle={`Last updated ${LEGAL.updated}`} maxWidth="max-w-3xl">
      <View className="gap-6 px-margin pb-10">
        <Txt variant="body-lg" className="text-on-surface-variant">{doc.summary}</Txt>
        {doc.sections.map((s, i) => (
          <View key={s.heading} className="gap-2">
            <Txt variant="headline-sm" accessibilityRole="header">{i + 1}. {s.heading}</Txt>
            {s.body.map((b, j) =>
              typeof b === 'string' ? (
                <Txt key={j} variant="body-md" className="leading-6 text-on-surface">{b}</Txt>
              ) : (
                <View key={j} className="gap-1.5">
                  {b.list.map((item) => (
                    <View key={item} className="flex-row gap-2.5 pr-2">
                      <Txt variant="body-md" className="text-primary-dark">•</Txt>
                      <Txt variant="body-md" className="flex-1 leading-6 text-on-surface">{item}</Txt>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}
        <View className="gap-1 rounded-3xl bg-secondary-fixed/40 p-4">
          <Txt variant="label-lg">Contact</Txt>
          <Txt variant="body-md" className="text-on-surface-variant">{LEGAL.operator} · {LEGAL.location}</Txt>
          <Txt variant="label-md" className="text-primary-dark" onPress={() => void Linking.openURL(`mailto:${LEGAL.privacyEmail}`)} accessibilityRole="link">
            {LEGAL.privacyEmail}
          </Txt>
        </View>
      </View>
    </Screen>
  );
}

/** "By continuing you agree to the Terms of use and Privacy policy", with both linked. */
export function AgreeToLegal() {
  return (
    <Txt variant="body-sm" className="text-center text-on-surface-variant">
      By continuing you agree to Vicinity’s{' '}
      <Txt variant="body-sm" className="text-primary-dark underline" accessibilityRole="link" onPress={() => router.push('/terms')}>Terms of use</Txt>
      {' '}and{' '}
      <Txt variant="body-sm" className="text-primary-dark underline" accessibilityRole="link" onPress={() => router.push('/privacy')}>Privacy policy</Txt>.
    </Txt>
  );
}
