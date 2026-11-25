import { Redirect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatThread } from '@/components/ChatThread';
import { useWide } from '@/components/Screen';

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wide = useWide();
  // Desktop shows conversations inside the hub's split view.
  if (wide) return <Redirect href={{ pathname: '/messages', params: { c: id } }} />;
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      <ChatThread conversationId={id} />
    </SafeAreaView>
  );
}
