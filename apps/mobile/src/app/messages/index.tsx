import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { colors } from '@vicinity/shared';
import { ChatThread } from '@/components/ChatThread';
import { ConversationList } from '@/components/ConversationList';
import { HubShell } from '@/components/HubShell';
import { BackButton, useWide } from '@/components/Screen';
import { EmptyState, Icon, Txt } from '@/components/ui';
import { useAuth } from '@/store/auth';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Messages Hub. Phones: list → /messages/[id]. Desktop: list and conversation side by side. */
export default function Messages() {
  const user = useAuth((s) => s.user);
  const wide = useWide();
  const { c } = useLocalSearchParams<{ c?: string }>();

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <EmptyState icon="chat" title="Sign in to message providers" action={{ label: 'Sign in', onPress: () => router.push('/login') }} />
      </SafeAreaView>
    );
  }

  if (wide) {
    return (
      <HubShell>
        <View className="flex-1 flex-row">
          <View className="w-[380px] bg-white">
            <ConversationList selectedId={c} onSelect={(x) => router.setParams({ c: x.id })} />
          </View>
          <View className="flex-1 border-l border-surface-container">
            {c ? (
              <ChatThread key={c} conversationId={c} embedded />
            ) : (
              <View className="flex-1 items-center justify-center gap-3">
                <View className="h-20 w-20 items-center justify-center rounded-full bg-primary-soft"><Icon name="forum" size={36} color={colors.primaryDark} /></View>
                <Txt variant="headline-sm">Select a conversation</Txt>
                <Txt variant="body-md" className="text-on-surface-variant">Your chats with providers and customers appear on the left.</Txt>
              </View>
            )}
          </View>
        </View>
      </HubShell>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-white">
      <View className="px-3 pt-2"><BackButton /></View>
      <ConversationList onSelect={(x) => router.push(`/messages/${x.id}`)} />
    </SafeAreaView>
  );
}
